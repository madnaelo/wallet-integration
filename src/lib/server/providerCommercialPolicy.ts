import providerCommercialPolicy from "../../../config/provider-commercial-policy.json";

export type SwapProviderId = keyof typeof providerCommercialPolicy.providers;

export const SUPPORTED_SWAP_PROVIDERS = Object.freeze(
  Object.keys(providerCommercialPolicy.providers) as SwapProviderId[]
);

export const DEFAULT_MONETIZED_SWAP_PROVIDERS = Object.freeze(
  SUPPORTED_SWAP_PROVIDERS.filter(isProviderMonetizationConfirmed)
);

export function parseSwapProviderList(value: string, variableName = "SWAP_PROVIDERS"): SwapProviderId[] {
  const providers = Array.from(
    new Set(value.split(",").map((provider) => provider.trim().toLowerCase()).filter(Boolean))
  );
  const supported = new Set<string>(SUPPORTED_SWAP_PROVIDERS);
  const unknown = providers.filter((provider) => !supported.has(provider));

  if (unknown.length > 0) {
    throw new Error(`${variableName} contains unsupported providers: ${unknown.join(", ")}.`);
  }

  return providers as SwapProviderId[];
}

export function resolveMonetizedSwapProviders(value: string): ReadonlySet<SwapProviderId> {
  const requested = parseSwapProviderList(
    value.trim() || DEFAULT_MONETIZED_SWAP_PROVIDERS.join(","),
    "MONETIZED_SWAP_PROVIDERS"
  );
  const unconfirmed = requested.filter((provider) => !isProviderMonetizationConfirmed(provider));

  if (unconfirmed.length > 0) {
    throw new Error(
      `MONETIZED_SWAP_PROVIDERS contains providers without confirmed commercial approval: ${unconfirmed.join(", ")}.`
    );
  }

  return new Set(requested);
}

export function isProviderMonetizationConfirmed(provider: SwapProviderId): boolean {
  return providerCommercialPolicy.providers[provider].monetization === "confirmed";
}
