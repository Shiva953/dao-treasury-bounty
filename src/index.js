// Create an API endpoint which returns back the total TVL of Realms 
// i.e. the total value of SOL and SPL tokens kept in the treasury of all the DAOs in USD value. 
// The data can be fetched and stored as JSON or otherwise (database) and update once a month. 
// The API can return a static stored data for a month.
//  The update to the data can be automatic or manual (through running a Node script monthly or otherwise).

import { getRealms } from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';
import { promises } from "dns";

// SPL-Governnance programID -> DAOs(identified by realm address)[each DAO -> wallets under it, total_balance(realms) = dao_treasury_tvl]
// figure out a way to find all realms under a dao

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const SHYFT_API_KEY = ""

const DAO_accounts = await connection.getProgramAccounts(programId)
// console.log(DAO_accounts[0]);

const realms = await getRealms(connection, programId);
const sample_dao_0 = realms.slice(0,10)[0].pubkey;
console.log(sample_dao_0)
const sample_dao = new PublicKey("DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE");

//getting dao treasury
async function fetchGraphQL(query, variables = {}, name = "MyQuery") {
    const result = await fetch(
      `https://programs.shyft.to/v0/graphql/?api_key=${SHYFT_API_KEY}`,
      {
        method: "POST",
        body: JSON.stringify({
          query: query,
          variables: variables,
          operationName: name
        })
      }
    );
  
    return await result.json();
  }
  
  async function getGovernanceAccountsForDAO(realmAddress) {
  
    //realms should be an array
    const query = `
    query MyQuery($_in: [String!] = "") {
    GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw_GovernanceV1(
      where: {realm: {_eq: ${JSON.stringify(realmAddress)}}}
    ) {
      pubkey
    }
    GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw_GovernanceV2(
      where: {realm: {_eq: ${JSON.stringify(realmAddress)}}}
    ) {
      pubkey
    }
  }
  `
    const { errors, data } = await fetchGraphQL(query);
  
    if (errors) {
      // handle those errors like a pro
      console.error(errors);
    }
  
    const govAccts = []
    data.GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw_GovernanceV1.forEach((dao) => {
        govAccts.push(dao?.pubkey)
    })
  
    data.GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw_GovernanceV2.forEach((dao) => {
        govAccts.push(dao?.pubkey)
    })
  
    console.log(govAccts);
  
    return govAccts;
  }
  
  function getNativeTreasuryAddress(governanceAccounts) {
    const programId = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw")
    const treasuryAddress = []
    
    governanceAccounts.forEach(async (governance) => {
      const acc = new PublicKey(governance)
      const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from('native-treasury'), acc.toBuffer()],
      programId
    );
      const addy = address.toBase58()
      console.log(addy)
      treasuryAddress.push(address.toBase58());
    })
  
    return treasuryAddress;
  }
  
  async function fetchTreasuryInfo(wallets) {
    console.time('portfolio')
    const promises = []
    //Once we have the treasury wallets, we can fetch their holdings
    wallets.map(async (wallet) => {
      promises.push(getPortfolio(wallet))
    })
    
    return await Promise.all(promises);
  }
  
  async function getPortfolio(wallet) {
    try {
      console.log('fetching portfolio for ', wallet)
      const result = await fetch(
        `https://api.shyft.to/sol/v1/wallet/get_portfolio?network=mainnet-beta&wallet=${wallet}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": SHYFT_API_KEY
          },
        }
      );
      const res = await result.json()
  
      return res;
      
    } catch (err) {
      console.error(err)
    }
  }
  
  async function getDaoTreasury(realmAddress) {
    
    //Get governance accounts for all realms
    const governanceAccounts = await   getGovernanceAccountsForDAO(realmAddress);
  
    // console.log('gov accounts fetched');
    const treasuryWallets = await getNativeTreasuryAddress(governanceAccounts);
    
    // console.log('treasury wallets: ', treasuryWallets);
    
    return await fetchTreasuryInfo(treasuryWallets);
  }

  const treasury = await getDaoTreasury("By2sVGZXwfQq6rAiAM3rNPJ9iQfb5e2QhnF4YjJ4Bip");
// const treasury = await getDaoTreasury("BzGL6wbCvBisQ7s1cNQvDGZwDRWwKK6bhrV93RYdetzJ");
// for (let i=500;i<510;i++){
//     const dao = realms[i].pubkey;
//     const treasury = await getDaoTreasury(dao.toString())
//     console.log(treasury)
// }
  console.dir(treasury, {depth: null})
  


