const allCustomers = require("./customersToUpdateTiers.json");
const {
  filterCustomers
} = require("./utils.js");

const customers = filterCustomers(allCustomers);

let subscriptionString = "";
customers.forEach((customer) => {
  subscriptionString += `'${customer.Subscription}', `;
});
subscriptionString = subscriptionString.length
  ? subscriptionString.slice(0, -2)
  : subscriptionString;

let usersString = "";
customers.forEach((customer) => {
  usersString += `'${customer["Customer Email"]}', `;
});
usersString = usersString.length ? usersString.slice(0, -2) : usersString;

exports.UPDATE_ACCOUNT_TIER_AND_PLAN = ` UPDATE account SET pricing_plan_id = ?, tier = ?, feature_list = ?,  mod_count = mod_count+1 
WHERE id = ?;`;

exports.PROMO_CODE_EXIST = "SELECT pc.* FROM promo_code as pc WHERE ";

exports.UPDATE_SUBSCRIPTION_START_DATE_SQL = `UPDATE subscription SET start_date = ? , updated = ?, updated_by = ?
  WHERE account_id = ?`;

let STRIPE_DATA_SQL = `SELECT
  sub.stripe_subscription_id,
  sub.account_id,
  sub.quantity,
  (
    SELECT COUNT(id)
    FROM workspace
    WHERE account = sub.account_id 
    AND active = 1
  ) AS number_of_workspaces,
  (
    SELECT COUNT(sys_user.id)
    FROM sys_user
    WHERE account_id = sub.account_id
    AND active = 1
  ) AS number_of_users,
    (
    SELECT feature_list
    FROM account
    WHERE account.id = sub.account_id
  ) AS feature_list,
  (
    SELECT promo_code
    FROM account
    WHERE account.id = sub.account_id
  ) AS promo_code,
  (
    SELECT tier
    FROM account
    WHERE account.id = sub.account_id
  ) AS tier
FROM
  subscription sub
WHERE
  sub.stripe_subscription_id  IN (`;

STRIPE_DATA_SQL += subscriptionString;
STRIPE_DATA_SQL += ")";
let USERS_DATA_SQL = `SELECT id, username, first_name, last_name, company, country FROM sys_user WHERE username IN (`;
USERS_DATA_SQL += usersString;
USERS_DATA_SQL += ")";

exports.STRIPE_DATA_SQL = STRIPE_DATA_SQL;
exports.USERS_DATA_SQL = USERS_DATA_SQL;
