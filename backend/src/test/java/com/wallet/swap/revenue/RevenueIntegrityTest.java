package com.wallet.swap.revenue;

import static org.assertj.core.api.Assertions.*;
import static com.wallet.swap.revenue.RevenueFixtures.*;
import com.wallet.swap.revenue.RevenueModels.*;
import jakarta.validation.Validation;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class RevenueIntegrityTest {
  private final RevenueIntegrity integrity = new RevenueIntegrity(properties(),JSON,Validation.buildDefaultValidatorFactory().getValidator());
  @Test void authenticatesTheServerPayloadAndRejectsChangedValues() {
    Envelope original = envelope(quote());
    assertThat(integrity.verify(original,true).quotes()).hasSize(1);
    assertThatThrownBy(() -> integrity.verify(new Envelope(original.payload().replace("2000","2001"),original.signature()),true))
        .hasMessageContaining("signature");
  }
  @Test void rejectsCorrectlySignedButMathematicallyWrongFees() {
    assertThatThrownBy(() -> integrity.verify(envelope(change(quote(),"expectedFee","1999")),true)).hasMessageContaining("Invalid revenue");
    assertThatThrownBy(() -> integrity.verify(envelope(change(quote(),"expectedFee","2001")),true)).hasMessageContaining("Invalid revenue");
  }
  @Test void rejectsOldUploadsButCanReadOldStoredEvidence() {
    Batch batch = new Batch(java.util.UUID.randomUUID(),1,Instant.now().minusSeconds(500).toEpochMilli(),
        List.of(quote()),List.of());
    assertThatThrownBy(() -> integrity.verify(envelope(batch),true)).hasMessageContaining("Invalid");
    assertThat(integrity.verify(envelope(batch),false).id()).isEqualTo(batch.id());
  }
  @Test void rejectsConflictingOwnerAndUnapprovedProvider() {
    assertThatThrownBy(() -> integrity.verify(envelope(change(quote(),"owner",TREASURY)),true)).hasMessageContaining("Invalid");
    assertThatThrownBy(() -> integrity.verify(envelope(change(quote(),"provider","odos")),true)).hasMessageContaining("Invalid");
  }
  @Test void rejectsDuplicateQuoteIdsAndInvalidLimits() {
    Snapshot q = quote();
    assertThatThrownBy(() -> integrity.verify(envelope(new Batch(java.util.UUID.randomUUID(),1,Instant.now().toEpochMilli(),
        List.of(q,q),List.of())),true)).hasMessageContaining("Invalid");
    assertThatThrownBy(() -> integrity.verify(envelope(change(q,"feeBps",301)),true)).hasMessageContaining("Invalid");
  }
}
