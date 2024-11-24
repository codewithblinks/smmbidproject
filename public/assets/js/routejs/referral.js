const transferForm = document.getElementById('transferForm');

transferForm.addEventListener('submit', async(e) => {
  e.preventDefault();

  const transferBTN = document.getElementById('transferBTN')
  const transferAmount = parseFloat(document.getElementById('transferAmount').value);

  if (isNaN(transferAmount) || transferAmount <= 0) {
    toastr.error("Please enter a valid transfer amount.");
    return;
    }

  transferBTN.disabled = true;
  transferBTN.textContent = 'Processing...';

  try {
      const response = await fetch('/transfer/referral/balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transferAmount
        }),
      });
      if (response.ok) {
        const data = await response.json();

        if (data.message) {
          toastr.success(data.message);
          window.location.href = `/referrals`;
        } else {
          toastr.error(data.error || "Transfer completed, but no confirmation message was received.");
        }
      } else {
        const errorData = await response.json();
        toastr.error(errorData.error || "Failed to process the transfer. Please try again.");
      }
    } catch (error) {
      toastr.error("An error occurred while processing the transfer.");
    } finally {
      transferBTN.disabled = false;
      transferBTN.textContent = "Confirm";
    }
})