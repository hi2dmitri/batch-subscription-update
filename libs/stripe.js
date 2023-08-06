const STRIPE = require("stripe");

module.exports = class Stripe {
  constructor(stripeKey) {
    this.stripe = new STRIPE(stripeKey);
  }

  handleStripeError(err, reject) {
    console.log("Stripe error: ", err);
    switch (err.type) {
      case "StripeCardError":
        // A declined card error
        //e.g. "Your card's expiration year is invalid."
        reject({
          status: "error",
          message: "Card declined",
          detail: err.message,
        });
        break;
      case "RateLimitError":
        // Too many requests made to the API too quickly
        reject({
          status: "error",
          message: "Too many requests to Stripe API",
          detail: err.message,
        });
        break;
      case "StripeInvalidRequestError":
        // Invalid parameters were supplied to Stripe's API
        reject({
          status: "error",
          message: "Invalid parameters to Stripe API",
          detail: err.message,
        });
        break;
      case "StripeAPIError":
        // An error occurred internally with Stripe's API
        reject({
          status: "error",
          message: "Internal Stripe API error",
          detail: err.message,
        });
        break;
      case "StripeConnectionError":
        // Some kind of error occurred during the HTTPS communication
        reject({
          status: "error",
          message: "Stripe API connection error",
          detail: err.message,
        });
        break;
      case "StripeAuthenticationError":
        // You probably used an incorrect API key
        reject({
          status: "error",
          message: "Stripe API authentication error",
          detail: err.message,
        });
        break;
      default:
        // Handle any other types of unexpected errors
        reject({
          status: "error",
          message: "Unknown Stripe API error",
          detail: err.message,
        });
        break;
    }
  }

  async updateSubscriptionMetadata(stripeSubscriptionId, metadata) {
    try {
      return await this.stripe.subscriptions.update(stripeSubscriptionId, {
        metadata,
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  updatePayment(stripeCustomerId, paymentMethod, metadata) {
    let that = this;
    return new Promise(function (resolve, reject) {
      that.stripe.paymentMethods
        .attach(paymentMethod, {
          customer: stripeCustomerId,
        })
        .then(
          function (result) {
            that.stripe.customers
              .update(stripeCustomerId, {
                invoice_settings: {
                  default_payment_method: paymentMethod,
                },
                metadata,
              })
              .then(
                function (result) {
                  resolve({ status: "ok" });
                },
                function (err) {
                  that.handleStripeError(err, reject);
                }
              );
          },
          function (err) {
            that.handleStripeError(err, reject);
          }
        );
    });
  }

  async removeSubscriptionDiscount(stripeSubscriptionId) {
    try {
      const { deleted } = await this.stripe.subscriptions.deleteDiscount(
        stripeSubscriptionId
      );
      if (!deleted) {
        return Promise.reject("Subscription discount was not deleted");
      }
    } catch (err) {
      let stripeError;
      const reject = (sError) => {
        stripeError = sError;
      };
      this.handleStripeError(err, reject);
      return Promise.reject(stripeError);
    }
  }
  async getCouponCode(couponCode) {
    try {
      return await this.stripe.coupons.retrieve(couponCode);
    } catch (err) {
      let stripeError;
      const reject = (sError) => {
        stripeError = sError;
      };
      this.handleStripeError(err, reject);
      return Promise.reject(stripeError);
    }
  }
  updateSubscriptionPlan(
    stripeSubscriptionId,
    stripePriceId,
    quantity,
    changeType,
    stripeCouponId,
    metadata
  ) {
    let prorationBehavior = "none";
    let that = this;
    return new Promise(function (resolve, reject) {
      that.stripe.subscriptions.retrieve(stripeSubscriptionId).then(
        function (subscription) {
          const updateSubscription = {
            proration_behavior: prorationBehavior,
            items: [
              {
                id: subscription.items.data[0].id,
                plan: stripePriceId,
                quantity: quantity,
              },
            ],
            metadata: {
              ...metadata,
              changeType,
            },
          };
          that.stripe.subscriptions
            .update(
              stripeSubscriptionId,
              stripeCouponId
                ? { ...updateSubscription, coupon: stripeCouponId }
                : updateSubscription
            )
            .then(
              function (result) {
                resolve(result);
              },
              function (err) {
                that.handleStripeError(err, reject);
              }
            );
        },
        function (err) {
          that.handleStripeError(err, reject);
        }
      );
    });
  }
};
