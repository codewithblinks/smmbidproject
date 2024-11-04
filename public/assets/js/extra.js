document.addEventListener('DOMContentLoaded', async () => {
  const firstSelect = document.getElementById('services');
  const secondSelect = document.getElementById('servicesMore');
  const secondSelect1 = document.getElementById('servicesMore1');
  const rateSelect = document.getElementById('rate');
  const quantitySelect = document.getElementById('quantity');
  const amountSelect = document.getElementById('amount');
  const qantityLimitSelect = document.getElementById('qantityLimit');
  const displayAmountSelect = document.getElementById('displayAmount');
  
displayAmountSelect.value = '₦ 0';
let exchangeRate = 1500;


  let allOptions = [];

  const serviceDescriptions = [
    { service: ['4800'], 
      description: [
        '🔗Link: https://www.facebook.com/username, All types of buttons enable the page to work',
        '🕓Start: 1 - 2 Hours, Almost within 20 Minutes',
        '🔥Speed: 1000 - 10,000 / day',
        '💎Quality: High quality',
        '🛡️Guarantee: Refill 90 days',

        'Average time: 31 hours 21 minutes'
      ]
      },
    { service: ['4801'], 
      description: [
        '🔗Link: Page with follow button',
        '🕓Start: Up to 3 hours start',
        '🔥Speed: 1k-3k',
        '💎Quality: High quality',
        '🛡️Guarantee: Refill 90 days',
        'Average time: 106 hours 34 minutes'
      ]
    },
    { service: ['4821'], 
      description: [
        'Start: 10 Min - 1 hours',
        'Speed: 10k / day',
        'Quality: High quality / Worldwide',
        'Guarantee: Lifetime Refill',
        'Drop ratio : 0%',
        'Link: Facebook fan page link Classic or Pro both working.',
        'Cancel Button: Allow',
        'Refill Button: Allow',
        'Note : This service works only like button enable page link.',
        'Average time: 8 hours 30 minutes'
      ]
    },
    { service: ['4822'], 
      description: [
        'Start: 1-2 Hours',
        'Speed: 40k-60k per day',
        'Quality: High quality / Worldwide',
        'Guarantee: Lifetime Refill',
        'Drop ratio : 0%',
        'New Layout/ Professional mode page/Profile all working .',
        'Average time: 67 hours 34 minutes'
      ]
    },
    { service: ['1455'], 
      description: [
        '🔗Link: Page With likes button',
        '🕓Start: INSTANT',
        '⚡Speed: 5K',
        '🛡️Guarantee: No Refill',

        'Average time: 19 hours 19 minutes'
      ]
    },
    { service: ['4374'], 
      description: [
        '🕓Start: 24-48 Hours',
        '🛡️Guarantee: 120 Days Refill',
        '💎Quality: 50-60% Egypt + Arab',
        '🪫Drop Ratio: 0%',

        'Average time: 58 hours 15 minutes'
      ]
    },
    { service: ['4584'], 
      description: [
        'Start: 0-24 Hours',
        'Speed per Day: 100 - 150',
        'Guarantee: No Drop (365 Days Guarantee)'
      ]
    },
    { service: ['4570'], 
      description: [
        'Start: 0-24 Hours',
        'Speed per Day: 250 - 1000',
        'Guarantee: No Drop (365 Days Guarantee)'
      ]
    },
    { service: ['417', '418', '419', '420'], 
      description: [
        '🔗 Link: https://m.facebook.com/story.php?story_fbid=150504007350939&id=100071740205170',
        '⚡ Average Speed: 2k-5k',
        '♻️ Refill: Non-Refill',
        '✅Per Submit Max 1k Allowed'
      ]
    },
    { service: ['4575', '4576', '4577', '4578', '4582', '4565'], 
      description: [
        'Start: 0-24 Hours',
        'Speed per Day: 100 - 150',
        'Guarantee: No Drop (365 Days Guarantee)'
      ]
    },
    { service: ['4559', '4561', '4562', '4563', '4564', '4564'], 
      description: [
        'Start: 0-24 Hours',
        'Speed per Day: 100 - 250',
        'Guarantee: No Drop (365 Days Guarantee)'
      ]
    },
    { service: ['5243'], 
      description: [
        'Link: https://www.facebook.com/pageusername',
        'Start: 1 min to 24 hrs ( Depend on Facebook update )',
        'Speed: 5k-10k ( Depend on Facebook update )',
        'Refill: 30 days',

        'Note: This service will accept any type of pages'
      ]
    },
    { service: ['5244'], 
      description: [
        'Link: https://www.facebook.com/pageusername',
        'Start: within 0 to 3hrs',
        'Speed: 10k-20k/day',
        'Refill: 60 days',

        'Note: This service will accept any type of pages'
      ]
    },
    { service: ['396'], 
      description: [
        '🔗 Link: https://www.facebook.com/pageusername',
        '⏱ Start: Instant within 0 min to 1 hrs (Please allow 24 hours)',
        '⚡ Average Speed: 5k/day',
        '♻️ Refill: 30days',

        '✨ Quality: High-Quality',
        '✅Guarantee: 30days'
      ]
    },
    { service: ['394'], 
      description: [
        '🔗 Link: https://www.facebook.com/pageusername',
        '⏱ Start: 0-3hrs',
        '⚡ Average Speed: 500 to 1000/day',
        '♻️ Refill: 30days'
      ]
    },
  ];

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('/api/exchange-rate');
      const data = await response.json();
      if (data.rate) {
        exchangeRate = data.rate; 
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  };

  // Fetch data once and store it
  const fetchOptionsData = async () => {
    try {
      const response = await fetch('/smm/options');
      allOptions = await response.json(); // Store all options in memory
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  // Filter options based on the selected category
  const filterOptions = (category) => {
    return allOptions.filter(item => item.category.toLowerCase().includes(category.toLowerCase()));
  };

  // Function to populate the second select dropdown
  const populateSecondSelect = (options) => {
    // Clear previous options
    secondSelect.innerHTML = '';
    secondSelect1.innerHTML = '';
    quantitySelect.value = '';
    amountSelect.value = '';
    displayAmountSelect.value = '₦ 0';

    // Create a document fragment to append all options in one go
    const fragment = document.createDocumentFragment();
    const fragment1 = document.createDocumentFragment();

    options.forEach(option => {
      const priceRate = (exchangeRate * option.rate) * 20 / 100;
      const rates = Math.floor(exchangeRate * option.rate + priceRate)

      const optionElement = document.createElement('option');
      optionElement.value = option.service;
      optionElement.textContent = `${option.name} - NGN ${rates} per 1000`;
      optionElement.dataset.rate = option.rate;
      optionElement.dataset.min = option.min;
      optionElement.dataset.max = option.max;
      fragment.appendChild(optionElement);

      // Populate the hidden second select similarly
      const optionElement1 = document.createElement('option');
      optionElement1.value = option.name;
      optionElement1.textContent = option.name;
      fragment1.appendChild(optionElement1);
    });

    secondSelect.appendChild(fragment);
    secondSelect1.appendChild(fragment1);

    // Set rate and quantity limits if there are options
    if (options.length > 0) {
      rateSelect.value = options[0].rate;
      qantityLimitSelect.innerHTML = `min: ${options[0].min} - max: ${options[0].max}`;
    } else {
      rateSelect.value = '';
      qantityLimitSelect.innerHTML = '';
    }
  };

  const updateDescription = () => {
    const selectedOption = secondSelect.options[secondSelect.selectedIndex];
    const services = selectedOption ? selectedOption.value : null;
    const matchingDescription = serviceDescriptions.find(service => service.service.includes(services));
  
    if (matchingDescription) {
      const descriptionList = matchingDescription.description
        .map(item => `<li>${item}</li>`)
        .join('');
      description.innerHTML = `
      <div>
        <label for="notes">Description</label>
        <div id="notes" class="form-textarea" style="font-size: 11px;">
          <ul>${descriptionList}</ul>
        </div>
    </div>
      `;
      description.style.display = 'block';
    } else {
      description.style.display = 'none';
    }
  };


  const updateSecondSelect = async () => {
    const selectedValue = firstSelect.value;

    // Filter the options based on the selected category
    const filteredOptions = filterOptions(selectedValue);

    // Populate the second select with filtered options
    populateSecondSelect(filteredOptions);
    updateDescription();
  };

  const updateRateInput = () => {
    const selectedOption = secondSelect.options[secondSelect.selectedIndex];
    const rate = selectedOption ? selectedOption.dataset.rate : '';
    const min = selectedOption ? selectedOption.dataset.min : '';
    const max = selectedOption ? selectedOption.dataset.max : '';
    
    // Reset the input fields
    quantitySelect.value = '';
    amountSelect.value = '';
    displayAmountSelect.value = '₦ 0';
    rateSelect.value = rate;
    qantityLimitSelect.innerHTML = `min: ${min} - max: ${max}`;

    updateDescription();
  };

  quantitySelect.addEventListener('input', (event) => {
    const inputValue2 = event.target.value.trim();
    const firstPrice = (rateSelect.value / 1000);
    const secondPrice = (inputValue2 * firstPrice);
    const price = (exchangeRate * secondPrice) * 20 / 100;
    const totalPrice = Math.floor((exchangeRate * secondPrice) + price);

    displayAmountSelect.value = `₦ ${totalPrice}`;
    amountSelect.value = totalPrice;
  });

  // Add event listeners
  firstSelect.addEventListener('change', updateSecondSelect);
  secondSelect.addEventListener('change', updateRateInput);

  await fetchExchangeRate();
  // Fetch data once and populate the second select on page load
  await fetchOptionsData();
  updateSecondSelect(); // Populate based on default selection
});
