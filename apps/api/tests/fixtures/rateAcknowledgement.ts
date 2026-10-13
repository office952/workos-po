type JsonBody = Record<string, unknown>;

/**
 * For tests that are not about rate acknowledgement: sends a freeze, and when the server refuses it
 * for missing acknowledgement, repeats it as the Owner acknowledging the returned binding.
 */
export async function freezeAcknowledgingRates(
  send: (body: JsonBody) => Response | Promise<Response>,
  body: JsonBody = {},
): Promise<Response> {
  const first = await send(body);
  if (first.status !== 422) {
    return first;
  }
  const refused = (await first.clone().json()) as {
    error?: unknown;
    rateAcknowledgement?: { bindingHash?: unknown } | null;
  };
  const bindingHash = refused.rateAcknowledgement?.bindingHash;
  if (refused.error !== "rate_acknowledgement_required" || typeof bindingHash !== "string") {
    return first;
  }
  return send({ ...body, rateAcknowledgement: { bindingHash } });
}
