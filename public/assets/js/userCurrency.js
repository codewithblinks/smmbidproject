//user change currency
document.addEventListener('DOMContentLoaded', function () {
document.querySelectorAll('.currency-list li').forEach((item) => {
    item.addEventListener('click', async (event) => {
        const selectedCurrency = event.currentTarget.dataset.currency;

      
        try {
            const response = await fetch('/set-currency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({currency: selectedCurrency }),
            });
            const result = await response.json();
            console.log(result)
            if (result.success) {
                toastr.success(result.message || 'Currency preference updated');
                setTimeout(() => {
                    location.reload();
                  }, 3000);
            } else {
                toastr.error(result.error || 'Failed to update currency');
            }
        } catch (error) {
            console.error('Error setting currency:', error);
        }
        });
    });
});