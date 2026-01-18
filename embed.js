import OnirixEmbedSDK from "https://unpkg.com/@onirix/embed-sdk@latest/dist/index.esm.js";

const iframeElement = document.getElementById("onirix-embed");
const embedSDK = new OnirixEmbedSDK(iframeElement);
embedSDK.connect();
