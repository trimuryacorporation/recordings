export const corsOrigins = [...new Set([
    "http://localhost:5173",
    "https://records.trimuryacorporation.in",
    "https://recordings-beige.vercel.app",
    ...(process.env.APP_URL ?? "").split(",").map((origin) => origin.trim()).filter(Boolean)
])];

export const corsOptions = {
    origin: corsOrigins,
    credentials: true
};