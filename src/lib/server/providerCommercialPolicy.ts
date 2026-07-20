import providerCommercialPolicy from "../../../config/provider-commercial-policy.json";

export type SwapProviderId = keyof typeof providerCommercialPolicy.providers;

export const SUPPORTED_SWAP_PROVIDERS = Object.freeze(
  Object.keys(providerCommercialPolicy.providers) as SwapProviderId[]
);

export const CONFIRMED_SWAP_PROVIDERS = Object.freeze(
  SUPPORTED_SWAP_PROVIDERS.filter(isProviderMonetizationConfirmed)
);

export const DEFAULT_SWAP_PROVIDERS = CONFIRMED_SWAP_PROVIDERS;
export const DEFAULT_MONETIZED_SWAP_PROVIDERS = CONFIRMED_SWAP_PROVIDERS;

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

export function resolveEnabledSwapProviders(value: string): SwapProviderId[] {
  const requested = parseSwapProviderList(
    value.trim() || DEFAULT_SWAP_PROVIDERS.join(","),
    "SWAP_PROVIDERS"
  );
  const unconfirmed = requested.filter((provider) => !isProviderMonetizationConfirmed(provider));

  if (unconfirmed.length > 0) {
    throw new Error(
      `SWAP_PROVIDERS contains providers without confirmed fee terms: ${unconfirmed.join(", ")}.`
    );
  }

  return requested;
}

export function resolveSwapProviderPolicy(
  enabledValue: string,
  monetizedValue: string
): { enabled: SwapProviderId[]; monetized: ReadonlySet<SwapProviderId> } {
  const enabled = resolveEnabledSwapProviders(enabledValue);
  const monetized = resolveMonetizedSwapProviders(monetizedValue);
  const enabledSet = new Set(enabled);
  const disabled = [...monetized].filter((provider) => !enabledSet.has(provider));
  const withoutFees = enabled.filter((provider) => !monetized.has(provider));

  if (disabled.length > 0) {
    throw new Error(
      `MONETIZED_SWAP_PROVIDERS contains disabled providers: ${disabled.join(", ")}.`
    );
  }
  if (withoutFees.length > 0) {
    throw new Error(
      `Every enabled swap provider must collect the configured platform fee; missing: ${withoutFees.join(", ")}.`
    );
  }

  return { enabled, monetized };
}

export function isProviderMonetizationConfirmed(provider: SwapProviderId): boolean {
  return providerCommercialPolicy.providers[provider].monetization === "confirmed";
}
