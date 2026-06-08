const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const vision = require("@google-cloud/vision");

admin.initializeApp();
setGlobalOptions({ region: "asia-southeast1" });

const client = new vision.ImageAnnotatorClient();

exports.ocrThaiIdCardV2 = onRequest(
    {
        memory: "512MiB",
        timeoutSeconds: 60,
        invoker: "public"
    },
    async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (req.method === "OPTIONS") {
            return res.status(204).send("");
        }

        try {
            if (req.method !== "POST") {
                return res.status(405).json({ error: "Method not allowed" });
            }

            const authHeader = req.headers.authorization || "";
            const idToken = authHeader.startsWith("Bearer ")
                ? authHeader.slice(7)
                : "";

            if (!idToken) {
                return res.status(401).json({ error: "Missing Firebase ID token" });
            }

            await admin.auth().verifyIdToken(idToken);

            const { imageBase64 } = req.body || {};
            if (!imageBase64) {
                return res.status(400).json({ error: "Missing imageBase64" });
            }

            const [result] = await client.textDetection({
                image: {
                    content: Buffer.from(imageBase64, "base64")
                }
            });

            const rawText = result.fullTextAnnotation?.text || "";

            const idMatch = rawText.match(
                /\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/
            );

            const idCard = idMatch ? idMatch[0].replace(/\D/g, "") : "";

            const lines = rawText
                .split(/\n+/)
                .map(s => s.trim())
                .filter(Boolean);

            const fullName =
                lines.find(l =>
                    /(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)/.test(l) && /[ก-๙]/.test(l)
                ) || "";

            const address =
                lines.find(l =>
                    /(บ้านเลขที่|หมู่|ถนน|ตำบล|แขวง|อำเภอ|เขต|จังหวัด)/.test(l)
                ) || "";

            return res.json({
                idCard,
                fullName,
                address,
                rawText
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({
                error: err.message || "OCR failed"
            });
        }
    }
);