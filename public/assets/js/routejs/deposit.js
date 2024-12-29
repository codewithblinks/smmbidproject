// cryptomus deposit
 const cryptomusDepositForm = document.getElementById('cryptomus-depositForm');
  const cryptomusSubmitBTN = document.getElementById('cryptomus-submitBtn');

  cryptomusDepositForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const cryptomus_amount = document.getElementById('cryptomus_amount');
    const currencyInput = document.getElementById('currency');
    const cryptoAmountValue = parseFloat(cryptomus_amount.value);
    const currency = currencyInput.value;

    const minAmount = userCurrency === "USD" ? 3 : 1500;
    const sign = userCurrency === "USD" ? '$' : '₦';

    if (
      !cryptoAmountValue ||
      isNaN(cryptoAmountValue) ||
      cryptoAmountValue < minAmount
    ) {
      toastr.error(`Minimum deposit amount is ${sign}${minAmount}).`);
      return;
    }

    cryptomusSubmitBTN.disabled = true;
    cryptomusSubmitBTN.textContent = 'Processing...';

    try {
      const response = await fetch('/create-cryptomus-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          cryptomus_amount: cryptoAmountValue, 
          currency, 
          userCurrency
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else {
          toastr.error(data.error || "Failed to process deposit. Please try again.");
        }
      } else {
        const errorData = await response.json();
        toastr.error(errorData.error || "Error submitting deposit. Please try again.");
      }
    } catch (error) {
      toastr.error("An error occurred while processing the deposit.");
      console.error(error.message);
    } finally {
      cryptomusSubmitBTN.disabled = false;
      cryptomusSubmitBTN.textContent = "Pay";
    }
  });


//bank deposit
  const depositForm = document.getElementById('depositForm');
  const submitBtn = document.getElementById('submitBtn');

  depositForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const bankAmountInput = document.getElementById('bank-amount');
    const bankAmountValue = parseFloat(bankAmountInput.value);
    const transactionReference = document.getElementById('transaction_reference').value;
    const paymentProof = document.getElementById('paymentProof').files[0];

    if (!bankAmountValue || isNaN(bankAmountValue) || bankAmountValue < 500) {
      toastr.error("Minimum deposit amount is ₦500.");
      return;
    }

    if (!transactionReference) {
      toastr.error("Transaction reference is required.");
      return;
    }
    
    if (!paymentProof) {
      toastr.error("Please upload a valid payment proof.");
      return;
    }

    const validImageTypes = ['image/png', 'image/jpeg'];
    if (!validImageTypes.includes(paymentProof.type)) {
      toastr.error("Only PNG and JPEG images are allowed.");
      return;
    }
   
    if (paymentProof.size > 5 * 1024 * 1024) { 
      toastr.error("File size must be less than 5MB.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    const formData = new FormData(depositForm);

    try {
      const response = await fetch('/deposit/bank', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toastr.success("Deposit submitted successfully. Awaiting approval.");
        setTimeout(() => {
          window.location.href = '/transactions';
        }, 1000);
      } else {
        const errorData = await response.json();
        toastr.error(errorData.error || "Error submitting deposit. Please try again.");
      }
    } catch (error) {
      toastr.error("An error occurred while processing the deposit.");
      console.log(error)
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "I've sent the money";
    }
  });

  function checkMinAmount(input) {
    const minAmount = 500;
    const value = parseFloat(input.value);

    if (isNaN(value) || value < minAmount) {
      toastr.error(`Minimum deposit is ₦${minAmount}`);
      input.setCustomValidity(`Minimum deposit is ₦${minAmount}`);
    } else {
      input.setCustomValidity('');
    }
  }

  function checkMinAmountCrytomus(input) {
    const minAmount = userCurrency === "USD" ? 3 : 1500;
    const sign = userCurrency === "USD" ? '$' : '₦';
    const value = parseFloat(input.value);

    if (isNaN(value) || value < minAmount) {
      input.setCustomValidity(`Minimum deposit is ${sign}${minAmount}`);
    } else {
      input.setCustomValidity('');
    }
  }
