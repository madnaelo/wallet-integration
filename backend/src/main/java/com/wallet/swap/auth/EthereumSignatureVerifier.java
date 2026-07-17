package com.wallet.swap.auth;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.SignatureException;
import java.util.Arrays;
import org.springframework.stereotype.Component;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;

@Component
public class EthereumSignatureVerifier {
  public boolean verifySignedMessage(String expectedAddress, String message, String signature) {
    try {
      byte[] signatureBytes = Numeric.hexStringToByteArray(signature);
      if (signatureBytes.length != 65) return false;

      byte v = signatureBytes[64];
      if (v < 27) v += 27;

      byte[] r = Arrays.copyOfRange(signatureBytes, 0, 32);
      byte[] s = Arrays.copyOfRange(signatureBytes, 32, 64);
      Sign.SignatureData signatureData = new Sign.SignatureData(v, r, s);
      BigInteger publicKey = Sign.signedPrefixedMessageToKey(message.getBytes(StandardCharsets.UTF_8), signatureData);
      String recoveredAddress = "0x" + Keys.getAddress(publicKey);

      return WalletAddress.normalize(expectedAddress).equals(WalletAddress.normalize(recoveredAddress));
    } catch (SignatureException | RuntimeException exception) {
      return false;
    }
  }
}
