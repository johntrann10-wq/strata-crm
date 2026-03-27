import { getAuthToken, getCurrentBusinessId } from "./auth";

type PrintAuthenticatedDocumentOptions = {
  url: string;
  businessId?: string | null;
  pendingTitle: string;
  loadErrorMessage: string;
};

export async function printAuthenticatedDocument({
  url,
  businessId,
  pendingTitle,
  loadErrorMessage,
}: PrintAuthenticatedDocumentOptions) {
  const token = getAuthToken();
  if (!token) {
    throw new Error("You need to sign in again before printing.");
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
  };
  const activeBusinessId = businessId ?? getCurrentBusinessId();
  if (activeBusinessId) {
    (headers as Record<string, string>)["x-business-id"] = activeBusinessId;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(loadErrorMessage);
  }

  const html = await response.text();
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.src = "about:blank";
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 250);
  };

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    iframe.remove();
    throw new Error("Could not open the printable document.");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      iframe.onload = null;
      cleanup();
      reject(new Error("Could not load the printable document."));
    }, 5000);

    iframe.onload = () => {
      window.clearTimeout(timeout);
      iframe.onload = null;
      resolve();
    };

    iframe.srcdoc = html;
  });

  const afterPrintHandler = () => {
    cleanup();
    printWindow.removeEventListener("afterprint", afterPrintHandler);
  };
  printWindow.addEventListener("afterprint", afterPrintHandler);
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
    cleanup();
  }, 100);
}
