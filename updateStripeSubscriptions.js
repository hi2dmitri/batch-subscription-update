const { QueryTypes } = require("sequelize");
const Sequelize = require("./database/sequelize");
const Stripe = require("./libs/stripe");
const neoAnalyticsApi = require("./libs/neoAnalyticsApi")();
const allCustomers = require("./customersToUpdateTiers.json");
const {
  filterCustomers,
  calculateTime,
  splitUp,
  delay,
} = require("./utils.js");
const {
  UPDATE_ACCOUNT_TIER_AND_PLAN,
  UPDATE_SUBSCRIPTION_START_DATE_SQL,
  STRIPE_DATA_SQL,
  USERS_DATA_SQL,
} = require("./queries.js");
const fs = require("fs");

module.exports = async () => {
  const sequelize = await Sequelize.init();
  const STRIPE_API = new Stripe(process.env.STRIPE_KEY);
  const customers = filterCustomers(allCustomers);

  const finalResults = [];

  const delayTime = 3000;
  const chunkSize = 300;
  const tiersToDowngrade = {
    14: 21,
    15: 21,
    17: 22,
    18: 22,
  };

  const defaultPricingPlanId = {
    21: 17,
    22: 18,
  };

  const feature_list = {
    21: `{"teamSize": 3,"numWsPerAccount": 1,"numUsersPerWs": 3,"numAppsPerWs": 1,"enableReact":true,"numMaxComponents": 25}`,
    22: `{"teamSize": 3, "numWsPerAccount": 1, "numUsersPerWs": 3 , "numAppsPerWs": 1 , "enableReact":true, "numMaxComponents": 25  }`,
  };

  const getPromoCode = async (params = {}) => {
    try {
      const { tiers_id: tiersId, ...parsedParams } = params;

      const query = Object.entries(parsedParams)
        .reduce(
          (acc, [prop, propValue]) =>
            propValue ? [...acc, `pc.${prop} = ?`] : acc,
          []
        )
        .join(" and ");

      if (!query) {
        throw new Error("Promo code parameters missing");
      }

      const result = await sequelize.query(
        `${PROMO_CODE_EXIST} ${query} and pc.active = 1`,
        {
          type: QueryTypes.SELECT,
          replacements: Object.values(parsedParams).filter((val) => val),
        }
      );

      if (result?.length) {
        const promoCodeRow = result[0];
        if (tiersId) {
          return promoCodeRow.tiers_id.split(",").includes(String(tiersId))
            ? promoCodeRow
            : {};
        }
        return promoCodeRow;
      }

      return {};
    } catch (err) {
      console.log("Failed to search promo code");
      return {};
    }
  };

  const getPromoCodeAndStripeCoupon = async (promoCodeId, tier) => {
    try {
      const promoCode = await getPromoCode({
        id: promoCodeId,
        tiers_id: tier,
      });

      if (!promoCode?.active || !promoCode?.stripe_coupon_id) {
        return {};
      }
      const stripeCoupon =
        (await STRIPE_API.getCouponCode(promoCode.stripe_coupon_id)) || {};
      if (!stripeCoupon?.valid) {
        return {};
      }

      return {
        stripeCoupon,
        promoCode,
      };
    } catch (e) {
      console.log("promocode error,", e);
      return {};
    }
  };

  const updateSubscriptionPlan = async function (
    accountId,
    stripeSubscriptionId,
    pricingPlanId,
    tierId,
    updateStartDate,
    featureList,
    quantity,
    currentTierId,
    changeType,
    promoCodeId,
    stripePriceId,
    user
  ) {
    let stripeCouponId = "";
    const updateStatus = {
      account_id: accountId,
      stripe_update: false,
      db_update: false,
    };

    if (promoCodeId) {
      try {
        let promoTierId = null;
        let stripe_coupon_id = null;
        const result = await getPromoCodeAndStripeCoupon(promoCodeId);
        if (result?.promoCode) {
          promoTierId = result.promoCode.tiers_id;
          stripe_coupon_id = result.promoCode.stripe_coupon_id;
        }
        if (
          promoTierId &&
          promoTierId.includes(currentTierId) &&
          !promoTierId.includes(tierId)
        ) {
          // Perform coupon remove
          await STRIPE_API.removeSubscriptionDiscount(stripeSubscriptionId);
        } else if (promoTierId && tierId && promoTierId.includes(tierId)) {
          // Prepare the coupon id to be added when subscription is updated
          stripeCouponId = stripe_coupon_id;
        }
      } catch (err) {
        try {
          // When an account has a promo code applied but the coupon is invalid for QUEST or Stripe
          // then try to remove the coupon from the current subscription
          await STRIPE_API.removeSubscriptionDiscount(stripeSubscriptionId);
        } catch (err2) {
          console.log(err2);
          // return err2;
        }
      }
    }

    const metadata = {
      accountId,
      tier: tierId,
      userId: user.user_id,
      stripeSubscriptionId,
      previousTier: currentTierId,
      isNeo: true,
    };
    // Now update stripe subscription plan
    try {
      let response = await STRIPE_API.updateSubscriptionPlan(
        stripeSubscriptionId,
        stripePriceId,
        quantity,
        changeType,
        stripeCouponId,
        metadata
      );

      updateStatus.stripe_update = Boolean(response?.id);
      // Now update the account with the pricing plan and tier
      const [affectedRowsCount, metaData] = await sequelize.query(
        UPDATE_ACCOUNT_TIER_AND_PLAN,
        {
          type: QueryTypes.UPDATE,
          replacements: [pricingPlanId, tierId, featureList, accountId],
        }
      );

      updateStatus.db_update = Boolean(metaData);

      if (metaData) {
        const firstName = user.first_name;
        const lastName = user.last_name;
        const email = user.email;
        const company = user.company;
        const country = user.country;

        neoAnalyticsApi.upsertMixpanelUser({
          userId: user.user_id,
          tier: tierId,
          firstName,
          lastName,
          email,
          accountId,
          company,
          isNeo: true,
          channel: "website",
          accessCode: null,
          country,
        });
        // account updated
        if (updateStartDate) {
          const res2 = await sequelize.query(
            UPDATE_SUBSCRIPTION_START_DATE_SQL,
            {
              type: QueryTypes.UPDATE,
              replacements: [new Date(), new Date(), "-1", accountId],
            }
          );

          return updateStatus;
        } else {
          return updateStatus;
        }
      } else {
        console.log("Did not update pricing plan and tier for: " + accountId);
        console.log(err);
        return updateStatus;
      }
    } catch (err) {
      console.log("Failed to stripe subscription for: " + accountId);
      console.log(err);

      return updateStatus;
    }
  };

  try {
    const res = await sequelize.query(STRIPE_DATA_SQL, {
      type: QueryTypes.SELECT,
    });

    const res1 = await sequelize.query(USERS_DATA_SQL, {
      type: QueryTypes.SELECT,
    });

    if (res?.length && res.length > 0 && res1.length && res1.length > 0) {
      const accountsToUpdateManually = [];
      const accountsToUpdateAutomatically = [];

      res.forEach((account) => {
        if (
          account.feature_list.includes("enableReact") &&
          (account.number_of_workspaces > 1 || account.number_of_users > 3) &&
          [14, 15, 17, 18].includes(account.tier)
        ) {
          accountsToUpdateManually.push(account);
        } else if (
          account.feature_list.includes("enableReact") &&
          account.number_of_workspaces === 1 &&
          account.number_of_users < 4 &&
          [14, 15, 17, 18].includes(account.tier)
        ) {
          let customer = customers.find(
            (c) => c.Subscription === account.stripe_subscription_id
          );
          account.stripe_customer_id = customer.Customer;
          account.customer_email = customer["Customer Email"];
          account.price_code = process.env.PRICE_CODE
          const user = res1.find(
            (user) => user.username === customer["Customer Email"]
          );
          account.user = user
            ? {
                user_id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                company: user.company,
                country: user.country,
                email: user.username,
              }
            : {};
          accountsToUpdateAutomatically.push(account);
        }
      });

      fs.writeFileSync(
        "update_manually.js",
        JSON.stringify(accountsToUpdateManually)
      );
      fs.writeFileSync(
        "update_automatically.js",
        JSON.stringify(accountsToUpdateAutomatically)
      );

      console.log(`Found ${accountsToUpdateAutomatically.length} rows...`);
      const splitRows = splitUp(accountsToUpdateAutomatically, chunkSize);
      calculateTime(splitRows, chunkSize, delayTime);

      console.time("Update Stripe Subscriptions");
      for (let i = 0; i < splitRows.length; i++) {
        console.log(`Starting with chunk ${i + 1}/${splitRows.length}`);
        const promises = [];

        for (let j = 0; j < splitRows[i].length; j++) {
          const each = splitRows[i][j];
          const newTier = tiersToDowngrade[each.tier];
          promises.push(
            updateSubscriptionPlan(
              each.account_id,
              each.stripe_subscription_id,
              defaultPricingPlanId[newTier],
              newTier,
              false,
              feature_list[newTier],
              each.quantity,
              each.tier,
              "downgrade",
              each.promo_code,
              each.price_code,
              each.user
            )
          );
        }

        if (promises.length > 0) {
          const results = (await Promise.allSettled(promises)).map(
            (each) => each.value
          );
          finalResults.push(results);
        }

        console.log("Waiting some time to prevent Stripe Rate Limit");
        await delay(1000);
      }
    }
    console.log("Ended!");
    console.timeEnd("Update Stripe Subscriptions");
    return finalResults.flat(1);
  } catch (error) {
    console.error("There was an error while running the function", error);
    return Promise.reject(error);
  }
};