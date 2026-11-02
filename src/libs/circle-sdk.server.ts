import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

export const getCircleSDK = () => {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY as string,
    entitySecret: process.env.CIRCLE_SECRET as string,
  });
};
