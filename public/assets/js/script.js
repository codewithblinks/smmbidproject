$(document).ready(function() {
  const oldImage = 'assets/images/icons/filter.svg'; // Path to the old image
  const newImage = 'assets/images/icons/closes.svg'; // Path to the new image

  $('#image-container1').on('click', function() {
      let $img = $('#image-swap');
      let currentSrc = $img.attr('src');

      if (currentSrc === oldImage) {
        $img.attr('src', newImage);
        $("#filter_inputs").removeClass('card_filter');
    } else {
        $img.attr('src', oldImage);
        $("#filter_inputs").addClass('card_filter');
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.me-3').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const productId = e.target.dataset.id || e.target.closest('.me-3').dataset.id;


      try {
        const response = await fetch(`/details/${productId}`);
        const product = await response.json();

      if (response.ok) {
       const accountUP = document.getElementById('profileUsername')
       accountUP.innerHTML = product.account_username;
       accountUP.href = product.profile_link;
       if(product.account_image) {
        document.getElementById('modalProductImage').src = "data:image/png;base64,<%= product.image.toString('base64') %>"
       }
       
      } else {
        console.error('Product not found');
      }

        // // Show the modal
        // $('#exampleModalCenter').modal('show');
      } catch (error) {
        console.error('Failed to fetch product details', err);
      }
    })
  })
})




