import dotenv from "dotenv";
import app from "./app.js";

dotenv.config({ quiet: true });

// On Vercel the platform serves the exported app; locally we listen ourselves.
// 0.0.0.0 so the phone can reach the laptop over the same Wi-Fi/hotspot.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`FlowPay server listening on port ${port}`);
  });
}

export default app;
