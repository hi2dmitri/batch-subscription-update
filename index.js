require("dotenv").config();
const fs = require("fs");

const updateStripeSubscriptions = require("./updateStripeSubscriptions");

async function main() {
  const res = await updateStripeSubscriptions();
  return res;
}

main()
  .catch((err) => console.error(err))
  .finally(() => process.exit());
