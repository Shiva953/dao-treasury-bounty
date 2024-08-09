# DAO-TVL Determination

The API Implementation here provides a way to calculate the Total Value Locked(TVL) in all the DAOs for a given DAO Governance Program Id(eg - the SPL-Governance Program ID `GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw`). It uses the `@solana/spl-governance` package along with the Jupiter API to calculate the final TVL in USD terms.

## Usage

<!-- Visit this endpoint - `https://dao-tvl.vercel.app/tvl/dao/{dao_governance_id}` and replace `dao_governance_id` with your DAO Governance Program ID.

OR -->

To run it locally:

1. Clone The Repository and Install Dependencies

    - `git clone https://github.com/Shiva953/dao-treasury-bounty.git`
    - `cd dao-treasury-bounty`
    - `npm install`

2. Replace the Connection URL with your custom RPC Url

3. Add your Postgres DB Url as `PG_DATABASE_URL` in .env file(Use Neon to create a sample postgres url)

4. Run `node src/index.js` to start the server for the first time.

5. The API will be available at `https://localhost:3000/dao/tvl/{dao_governance_id}`

Example Request:

`GET https://localhost:3000/dao/tvl/GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw`
- Endpoint: `/dao/tvl/GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw`
- Method: `GET`

Example Response:

1. Successful(`200 OK`)

    `
    {
        tvl: "333630340.982120544"
    }
    `

2.Error(`500`)
