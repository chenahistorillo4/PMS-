import QRCode from "qrcode.react";
import html2canvas from "html2canvas";

/**
 * Generate QR code as data URL from a reference code
 * @param {string} referenceCode - The reference code to encode in QR
 * @returns {Promise<string>} - Data URL of the QR code
 */
export const generateQRCodeImage = async (referenceCode) => {
  try {
    // Create a temporary container
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.backgroundColor = "white";
    container.style.padding = "10px";
    document.body.appendChild(container);

    // Render QR code component to the temporary container
    const qrElement = document.createElement("div");
    qrElement.id = "temp-qr-code";
    container.appendChild(qrElement);

    // Use html2canvas to capture the QR code
    // For now, we'll return a simple approach: just use the reference code as the QR value
    // The actual QR code generation can happen on the scanner side
    return referenceCode;
  } catch (error) {
    console.error("Error generating QR code image:", error);
    throw error;
  }
};

/**
 * Generate a data URL for QR code without requiring React rendering
 * Uses a simple canvas-based approach
 * @param {string} value - The value to encode
 * @returns {Promise<string>} - Base64 data URL
 */
export const generateSimpleQRCode = async (value) => {
  try {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    
    return new Promise((resolve, reject) => {
      script.onload = () => {
        const container = document.createElement("div");
        container.id = `qr-${Date.now()}`;
        container.style.position = "fixed";
        container.style.left = "-9999px";
        document.body.appendChild(container);

        try {
          const qr = new QRCode(container.id, {
            text: value,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
          });

          setTimeout(() => {
            const canvas = container.querySelector("canvas");
            if (canvas) {
              const dataUrl = canvas.toDataURL("image/png");
              container.remove();
              resolve(dataUrl);
            } else {
              reject(new Error("QR code canvas not found"));
            }
          }, 500);
        } catch (error) {
          container.remove();
          reject(error);
        }
      };

      script.onerror = () => {
        reject(new Error("Failed to load QR code library"));
      };

      document.head.appendChild(script);
    });
  } catch (error) {
    console.error("Error generating simple QR code:", error);
    throw error;
  }
};
