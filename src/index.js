import { getAllGovernances, getNativeTreasuryAddress, getRealms } from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import express from "express";
import { setTimeout } from "timers/promises"
import NodeCache from 'node-cache';
import pkg from "pg"
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads"

const Client = pkg.Client;

// DAO Governance PROGRAM ID -> DAOs, DAO -> Governance Accounts, Each Governance Account -> Treasury Accounts

const app = express()
const port = 3000

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

const client = new Client({
  connectionString: process.env.PG_DATABASE_URL,
});

client.connect();
try{
  client.query(
    `CREATE TABLE IF NOT EXISTS tvl (
  id SERIAL PRIMARY KEY,
  daoGovernanceId TEXT NOT NULL,
  tvl NUMERIC NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`
  );
} catch(err){
  console.log(err)
}

//caching prices of frequent tokens
const cache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes
async function priceInUSDC(mint, amount) {
  const cacheKey = `price_${mint}`;
  let price = cache.get(cacheKey);

  if (price === undefined) {
    try {
      const res = await fetch(`https://price.jup.ag/v6/price?ids=${mint}&vsToken=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`);
      const data = await res.json();
      price = data.data[mint]?.price || 0;
      cache.set(cacheKey, price);
    } catch (err) {
      console.log(err);
      return 0;
    }
  }

  return price * amount;
}

async function getAccountsBalance(wallets) {
  let total = 0;

  for (let wallet of wallets) {
    const walletKey = wallet.toBase58();
    let cachedBalance = cache.get(walletKey);

    if (cachedBalance === undefined) {
      let walletTotal = 0;

      const sol_lamports_balance = await connection.getBalance(wallet);
      const sol_balance = sol_lamports_balance / 1_000_000_000;
      const solBalanceinUSD = await priceInUSDC('So11111111111111111111111111111111111111112', sol_balance);
      walletTotal += solBalanceinUSD;

      const [token_accounts_org, token_accounts_2022] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_2022_PROGRAM_ID })
      ]);

      const token_accounts = token_accounts_org.value.concat(token_accounts_2022.value);

      for (const tokenAccount of token_accounts) {
        const account = tokenAccount.account;
        const mintAddress = account.data.parsed.info.mint;
        const balance = account.data.parsed.info.tokenAmount.uiAmount;
        const USDCamount = await priceInUSDC(mintAddress, balance);
        walletTotal += USDCamount;
      }

      cache.set(walletKey, walletTotal);
      cachedBalance = walletTotal;
    }

    total += cachedBalance;
  }

  return total;
}

const tvlCache = new NodeCache({ stdTTL: 86400 }); 

// async function getTVL(realms){
//   const cacheKey = `tvl_${realms[0].owner.toBase58()}`;
//   let cachedTVL = tvlCache.get(cacheKey);
//   let tvl = 0;
//   for (const realm of realms){
//     const gov_accounts = await getAllGovernances(connection, new PublicKey(realm.owner.toBase58()), new PublicKey(realm.pubkey.toBase58()));
//     const treasury_accounts = await Promise.all(gov_accounts.map(gov => getNativeTreasuryAddress(new PublicKey(realm.owner.toBase58()), gov.pubkey)));
//     const balance = await getAccountsBalance(treasury_accounts)
//     tvl+=balance;
//     console.log("Updated TVL: ", tvl)
//   }
//   console.log("Total TVL of all DAO Treasuries: ", tvl);
//   tvlCache.set(cacheKey, tvl);

//   return tvl;
// }

async function getTVL(realms) {
  const cacheKey = `tvl_${realms[0].owner.toBase58()}`;
  let cachedTVL = tvlCache.get(cacheKey);

  if (cachedTVL !== undefined) {
    console.log("Returning cached TVL value");
    return cachedTVL;
  }

  let tVL = 0;
  const batchSize = 15;
  const delayBetweenBatches = 1000;

  //batching requests in sizes of 15
  for (let i = 0; i < realms.length; i += batchSize) {
    const realm_batch = realms.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(realms.length / batchSize)}`);

    const tvlBatch = await Promise.all(realm_batch.map(async (realm) => {
      return retryWithBackoff(async () => {
        const gov_accounts = await getAllGovernances(connection, new PublicKey(realm.owner.toBase58()), new PublicKey(realm.pubkey.toBase58()));
        const treasury_accounts = await Promise.all(gov_accounts.map(gov => getNativeTreasuryAddress(new PublicKey(realm.owner.toBase58()), gov.pubkey)));
        return getAccountsBalance(treasury_accounts);
      });
    }));

    tVL += tvlBatch.reduce((sum, value) => sum + value, 0);
    console.log("Updated TVL: ", tVL);


    if (i + batchSize < realms.length) {
      await setTimeout(delayBetweenBatches);
    }
  }

  console.log("Total TVL of all DAO Treasuries: ", tVL);
  tvlCache.set(cacheKey, tVL);

  await client.query(
    `INSERT INTO tvl (daoGovernanceId, tvl, timestamp) VALUES ($1, $2, NOW())`,
    [realms[0].owner.toBase58(), tVL]
  );
  return tVL;
}

//retrying the request, in case rate limit exceeds
async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 1000) {
  let retries = 0;
  while (retries < maxRetries) {
      try {
          return await fn();
      } catch (error) {
          if (error.message.includes('429') && retries < maxRetries - 1) {
              const delay = initialDelay * Math.pow(2, retries);
              console.log(`Rate limited. Retrying after ${delay}ms...`);
              await setTimeout(delay);
              retries++;
          } else {
              throw error;
          }
      }
  }
}

//example usage
const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const realms = await getRealms(connection, programId);
getTVL(realms)

//exposing the endpoint
app.get('/tvl/dao/:daoGovernanceId', async (req, res) => {
  const daoGovernanceId = req.params.daoGovernanceId;
  const cacheKey = `tvl_${daoGovernanceId}`;

  const { rows: existingRows } = await client.query(
    `SELECT value FROM tvl WHERE realm = $1 AND timestamp > NOW() - INTERVAL '6 days' ORDER BY timestamp DESC LIMIT 1`,
    [daoGovernanceId]
  );

  try {
    let tvlAmount = tvlCache.get(cacheKey);

    if (tvlAmount === undefined) {
      console.log("Calculating TVL...");
      const realms = await getRealms(connection, new PublicKey(daoGovernanceId));
      tvlAmount = await getTVL(realms);
      tvlCache.set(cacheKey, tvlAmount);
      await client.query(
        `INSERT INTO tvl (realm, value, timestamp) VALUES ($1, $2, NOW())`,
        [daoGovernanceId, tvlAmount]
      );
    } else {
      console.log("Returning cached TVL value");
    }

    res.json({ tvl: tvlAmount });
  } catch (error) {
    console.error('Error fetching TVL:', error);
    res.status(500).send('Error fetching TVL');
  }
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})


