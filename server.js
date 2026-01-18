require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

// Serve index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Step 1: Start generation & upload, return taskId immediately
app.post("/api/start-glb", async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        // 1️⃣ Generate image from Gemini
        const gemResponse = await genAI.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: prompt,
        });

        let imageBase64 = null;
        for (const part of gemResponse.candidates[0].content.parts) {
            if (part.inlineData) imageBase64 = part.inlineData.data;
        }
        if (!imageBase64) return res.status(500).json({ error: "No image returned" });

        const imagePath = path.join(__dirname, "room.png");
        fs.writeFileSync(imagePath, Buffer.from(imageBase64, "base64"));

        // 2️⃣ Upload image to Tripo
        const buffer = fs.readFileSync(imagePath);
        const formData = new FormData();
        formData.append("file", new Blob([buffer], { type: "image/png" }), "room.png");

        const uploadResp = await fetch("https://api.tripo3d.ai/v2/openapi/upload/sts", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY}` },
            body: formData,
        });

        if (!uploadResp.ok) {
            const text = await uploadResp.text();
            return res.status(500).json({ error: `Upload failed: ${text}` });
        }

        const uploadData = await uploadResp.json();
        const fileToken = uploadData?.data?.image_token || uploadData?.image_token;
        if (!fileToken) return res.status(500).json({ error: "No fileToken returned" });

        // 3️⃣ Create Tripo task
        const taskPayload = { type: "image_to_model", file: { type: "jpg", file_token: fileToken } };
        const taskResp = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.TRIPO_API_KEY}`,
            },
            body: JSON.stringify(taskPayload),
        });

        if (!taskResp.ok) {
            const text = await taskResp.text();
            return res.status(500).json({ error: `Task creation failed: ${text}` });
        }

        const taskData = await taskResp.json();
        const taskId = taskData?.data?.task_id;
        if (!taskId) return res.status(500).json({ error: "No taskId returned" });

        // Return taskId and image path immediately
        res.json({ success: true, taskId, imagePath: "/room.png" });
    } catch (err) {
        console.error("Start GLB error:", err);
        res.status(500).json({ error: "Failed to start GLB generation" });
    }
});

// Step 2: Poll Tripo task status
app.get("/api/check-task/:taskId", async (req, res) => {
    try {
        const { taskId } = req.params;
        if (!taskId) return res.status(400).json({ error: "taskId required" });

        const statusResp = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY}` },
        });

        if (!statusResp.ok) return res.status(500).json({ error: "Failed to fetch task status" });

        const statusData = await statusResp.json();
        const status = statusData?.data?.status || statusData?.data?.result?.status;

        const glbUrl = statusData?.data?.output?.pbr_model || statusData?.data?.result?.pbr_model || null;
        if (status === "success" && glbUrl) {
            const glbPath = path.join(__dirname, "model.glb");

            const glbResp = await fetch(glbUrl);
            const buffer = Buffer.from(await glbResp.arrayBuffer());
            fs.writeFileSync(glbPath, buffer);
            console.log("GLB saved:", glbPath);
        }
        res.json({ status, glbUrl, glbPath: "/model.glb" });
    } catch (err) {
        console.error("Check task error:", err);
        res.status(500).json({ error: "Failed to check task" });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
