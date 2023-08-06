module.exports = {
  filterCustomers: (allCustomers) => {
    let filteredCustomers = [];
    allCustomers.forEach((customer) => {
      let existing = filteredCustomers.some(
        (c) => c.Subscription === customer.Subscription
      );
      if (!existing) {
        filteredCustomers.push(customer);
      }
    });
    return filteredCustomers;
  },
  delay:  (ms) => new Promise((res) => setTimeout(res, ms)),
  splitUp: (arr, n) => {
    let rest = arr.length % n, // how much to divide
      restUsed = rest, // to keep track of the division over the elements
      partLength = Math.floor(arr.length / n),
      result = [];

    for (let i = 0; i < arr.length; i += partLength) {
      let end = partLength + i,
        add = false;

      if (rest !== 0 && restUsed) {
        // should add one element for the division
        end++;
        restUsed--; // we've used one division element now
        add = true;
      }

      result.push(arr.slice(i, end)); // part of the array

      if (add) {
        i++; // also increment i in the case we added an extra element for division
      }
    }

    return result;
  },
  calculateTime: (results, chunkSize, delay) => {
    const amountOfChunks = results.length;
    const amountOfElementsByChunk = results[0].length;
    const totalTime = `${(amountOfChunks * delay) / 60 / 1000} min`;

    console.log(
      "For most APIs, Stripe allows up to 100 read operations per second and 100 write operations per second in live mode, and 25 operations per second for each in test mode."
    );
    console.log("For more info, go here https://stripe.com/docs/rate-limits");
    console.log(
      `Chunk Size: ${chunkSize} \nAmount of Chunks: ${amountOfChunks} \nAmount of Elements per Chunk (aprox): ${amountOfElementsByChunk}`
    );
    console.log(`\nEstimated time: ${totalTime}`);
  }
};
