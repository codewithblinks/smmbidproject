document.addEventListener('DOMContentLoaded', function () {
    const twoFactorEnabled = <%= user.two_factor_enabled ? 'true' : 'false' %>;
    const button = document.getElementById('2fa-button');
    const enableModal = new bootstrap.Modal(document.getElementById('enable2faModal'));
    const disableModal = new bootstrap.Modal(document.getElementById('disable2faModal'));
  
    if (button) {
        button.addEventListener('click', function () {
      if (twoFactorEnabled) {
        disableModal.show();
      } else {
        fetch('/auth/2fa/setup')
          .then(response => response.json())
          .then(data => {
            document.getElementById('qr-code').src = data.qr;
            document.getElementById('secret-key').textContent = data.secret;
            enableModal.show();
          })
          .catch(error => console.log('Error:', error));
      }
    });
  
  } 
   
    document.getElementById('verify-2fa-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const token = document.getElementById('token').value;
      fetch('/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: token })
      })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            toastr.success('2FA has been enabled successfully.');
            button.textContent = 'Disable 2FA';
            enableModal.hide();
  
          } else {
            toastr.error('invalid code.');
          }
        })
        .catch(error => console.log('Error:', error));
    });
  
    document.getElementById('disable-2fa-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const token = document.getElementById('tokendisabled').value;
      fetch('/auth/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: token })
      })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            toastr.success('2FA has been disabled successfully.');
            button.textContent = 'Enable 2FA';
            disableModal.hide();
            twoFactorEnabled = false;
          } else {
            toastr.error('invalid code');
          }
        })
        .catch(error => console.log('Error:', error));
    });
  
  
    
  
    const acct = document.querySelector("#account_number");
    const warn = document.querySelector(".warningText")
    const btn = document.querySelector(".btnAdd")
    const bank = document.querySelector("#bank")
  
    if (acct && warn && btn && bank) {
      acct.addEventListener("input", () => {
      let val = acct.value.trim();
      if (val.length < 10) {
        warn.innerText = "Invalid account number"
      } else {
        warn.innerText = ""
      }
    });
  
   
    btn.addEventListener('click', function (event) {
      const value = acct.value.trim();
  
      if (value.length < 10 || isNaN(value)) {
        event.preventDefault();
        warn.innerText = "Please enter at least 10 digits."
      } else if (bank.value === "Select Bank") {
        event.preventDefault();
        warn.innerText = "Please select a valid bank."
      }
      else {
        warn.innerText = ""
      }
    });
  
  
  
  
    const addAccountButton = document.getElementById('addAccountButton');
  
    // Function to enable/disable the Add Account button based on account count
    function updateAddAccountButton(accountCount) {
      if (accountCount >= 3) {
        addAccountButton.disabled = true;
        addAccountButton.classList.add('disabled-button');
      } else {
        addAccountButton.disabled = false;
        addAccountButton.classList.remove('disabled-button');
      }
    }
  
    // Initial check
    updateAddAccountButton(<%= accountCount %>);
  
    // Assuming you have a way to dynamically add accounts, e.g., via an AJAX call
    // For demonstration, let's assume there's a function to add an account and then update the button state
    function addAccount() {
      // Code to add account
      // For demonstration, we'll just increment the account count
      let accountCount = <%= accountCount %> + 1; // This should be updated with the actual new count
      updateAddAccountButton(accountCount);
    }
  
    // Attach addAccount function to the Add Account button click event
    addAccountButton.addEventListener('click', addAccount);
  }
  });