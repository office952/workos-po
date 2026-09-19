const API = "http://127.0.0.1:8787";

const customer = await fetch(`${API}/api/customers`, {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    displayName: "Client sintetic Reference Slice V1",
  }),
}).then((response) => response.json());

const customerId = customer?.customer?.customerId ?? customer?.customerId;
if (typeof customerId !== "string") {
  throw new Error("Harness customer was not created.");
}

process.stdout.write(`${customerId}\n`);
process.stdout.write(`http://127.0.0.1:5173/?customer=${encodeURIComponent(customerId)}\n`);
