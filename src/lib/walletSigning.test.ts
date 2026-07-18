import { describe, expect, it, vi } from "vitest";
import type { Eip1193Provider } from "@/lib/wallet";
import { signPersonalMessage } from "@/lib/walletSigning";

const WALLET = "0x0000000000000000000000000000000000000001";
const SIGNATURE = "0x" + "ab".repeat(65);

describe("signPersonalMessage", () => {
  it("uses hexadecimal personal_sign first for an injected wallet", async () => {
    const request = vi.fn().mockResolvedValue(SIGNATURE);
    const provider = { request } as Eip1193Provider;

    const result = await signPersonalMessage({
      provider,
      walletAddress: WALLET,
      message: "Sign in",
      providerKind: "injected"
    });

    expect(result).toBe(SIGNATURE);
    expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: ["0x5369676e20696e", WALLET]
    });
  });

  it("uses text first and a protocol-valid expiry for WalletConnect", async () => {
    const request = vi.fn().mockResolvedValue(SIGNATURE);
    const provider = {
      request,
      session: { namespaces: { eip155: { methods: ["personal_sign"] } } }
    } as unknown as Eip1193Provider;

    await signPersonalMessage({
      provider,
      walletAddress: WALLET,
      message: "Sign in",
      providerKind: "walletconnect"
    });

    expect(request).toHaveBeenCalledWith(
      { method: "personal_sign", params: ["Sign in", WALLET] },
      undefined,
      300
    );
  });

  it("tries the alternate format when a wallet rejects the first format", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("unsupported format"))
      .mockResolvedValueOnce(SIGNATURE);
    const notices: string[] = [];

    const result = await signPersonalMessage({
      provider: { request } as Eip1193Provider,
      walletAddress: WALLET,
      message: "Sign in",
      providerKind: "injected",
      setNotice: (notice) => notices.push(notice)
    });

    expect(result).toBe(SIGNATURE);
    expect(request).toHaveBeenCalledTimes(2);
    expect(notices).toContain(
      "The wallet did not accept the first signing format. Trying the alternate signing format..."
    );
  });

  it("fails before requesting when WalletConnect did not approve message signing", async () => {
    const request = vi.fn();
    const provider = {
      request,
      session: { namespaces: { eip155: { methods: ["eth_sendTransaction"] } } }
    } as unknown as Eip1193Provider;

    await expect(signPersonalMessage({
      provider,
      walletAddress: WALLET,
      message: "Sign in",
      providerKind: "walletconnect"
    })).rejects.toThrow("did not approve personal_sign");
    expect(request).not.toHaveBeenCalled();
  });
});
