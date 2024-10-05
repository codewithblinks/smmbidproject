// const myModal = document.getElementById('myModal')
// const myInput = document.getElementById('myInput')

// myModal.addEventListener('shown.bs.modal', () => {
//   myInput.focus()
// })

document.getElementById('tax').addEventListener('input', function(event) {
  const inputValue = event.target.value.trim(); // Get the trimmed value of the input
 const inputPrice = (inputValue * 80) / 100;
 const Price = Math.floor(inputPrice)

  const totalPrice = `You will receive ₦  ${Price} after a successful trade`
  

  // If the input value is not empty, show the h1 element, otherwise hide it
  if (inputValue !== '') {
    
      document.getElementById('info2').style.display = 'block';
      document.getElementById('info2').innerHTML = `${totalPrice}`
  } else {
      document.getElementById('info2').style.display = 'none';
  }
});


