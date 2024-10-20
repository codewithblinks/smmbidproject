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

  const updateSecondSelect = async () => {
    const selectedValue = firstSelect.value;

    // Filter the options based on the selected category
    const filteredOptions = filterOptions(selectedValue);

    // Populate the second select with filtered options
    populateSecondSelect(filteredOptions);
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
