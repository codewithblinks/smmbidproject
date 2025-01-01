// delete activities 

document.addEventListener('DOMContentLoaded', () => {
  const logEntries = document.querySelectorAll('.log-entry');

  logEntries.forEach(logEntry => {
    logEntry.addEventListener('click', async function () {

      const activityId = this.getAttribute('data-id');

      const confirmDelete = confirm('Are you sure you want to delete this activity?');
      if (!confirmDelete) {
        return; 
      }

      try {
        const response = await fetch(`/delete/activity-log/${activityId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          this.remove();
        } else {
          console.error('Failed to delete activity:', activityId);
        }
      } catch (error) {
        console.error('Error deleting activity:', error);
      }
    });
  });

//user change currency

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

// weekly progress
                async function fetchWeeklyProgress() {
                try {
                    const [response, responseExchangeRate] = await Promise.all([
                    fetch('/weekly-progress'),
                    fetch('/api/api/exchange-rate')
                    ]);

                    if (!response.ok || !responseExchangeRate.ok) {
                    throw new Error('Failed to fetch required data.');
                    }

                    const data = await response.json();
                    const exchangeRate = await responseExchangeRate.json();

                    const rate = Math.floor(exchangeRate.rate?.NGN || 1);
                    const totalPrize = userCurrency === 'USD' ? (20000 / rate).toFixed(2) : 20000;
                    const formattedPrize = new Intl.NumberFormat('en-US').format(totalPrize);
                    const sign = userCurrency === 'USD' ? '$' : '₦';

                    const progressBar = document.getElementById('progress-bar');
                    const progressBarCount = document.getElementById('progress-bar-count');
                    const progressText = document.getElementById('progress-text');
                    const total = document.getElementById('total');

                    if (progressBar && progressBarCount && progressText) {
                    const progressValue = Math.floor(data.progress) || 0;
                    progressBar.style.width = `${progressValue}%`;
                    progressBarCount.innerText = `${progressValue}%`;
                    progressText.innerText = `${sign}${data.totalSuccessfulTransaction} / ${sign}${formattedPrize}`;
                    total.innerText = `${sign}${formattedPrize}`;
                    }

                    let totalTransaction = parseFloat(
                    (data.totalSuccessfulTransaction || '0').replace(/,/g, '')
                    );

                    if (isNaN(totalTransaction)) totalTransaction = 0;

                    if (userCurrency === 'USD') {
                    totalTransaction *= rate;
                    }

                    if (totalTransaction >= totalPrize) {
                    const winElement = document.getElementById('win');
                    const showElement = document.getElementById('show');

                    if (winElement) winElement.style.display = 'block';
                    if (showElement) showElement.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Error fetching progress:', error.message);
                }
                }

                window.onload = fetchWeeklyProgress;