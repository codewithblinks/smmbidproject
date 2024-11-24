
export async function convertPriceForProducts(rate, product, userCurrency) {

    if (userCurrency === 'USD') {
      return product.map(products => ({
        ...products,
        convertedProductPrice: (Number(products.amount) / rate).toFixed(2),
        currency: 'USD'
    }));
      } else if (userCurrency === 'NGN') {
        return product.map(products => ({
          ...products,
          convertedProductPrice: products.amount, 
          currency: 'NGN'
      }));
      }
  }