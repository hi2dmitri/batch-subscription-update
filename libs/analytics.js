const Mixpanel = require('mixpanel');

function register() {
  let mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);

  let upsertMixpanelUser = function ({
    userId,
    firstName,
    lastName,
    company,
    tier,
    accessCode,
  }) {
    let account = "";
    if (!company) {
      account = "#NOCOMPANY#:" + firstName + ":" + lastName;
    } else {
      account = company + ":" + firstName + ":" + lastName;
    }

    account = account.substring(
      0,
      account.length > 79 ? 79 : account.length
    );

    mixpanel.people.set(userId, {
      "tier": tier,
      "tier_type": "Free",
      "access_code": accessCode
    });
  }

  return {
    "upsertMixpanelUser": upsertMixpanelUser,
  };
};

module.exports = register;
