import express from "express";
import db from "../../db/index.js";
import flash from "connect-flash";
import { adminEnsureAuthenticated, adminRole } from "../../authMiddleware/authMiddleware.js";
import moment from "moment";
import numeral from "numeral";

const router = express.Router();

router.get("/admin/list/product", adminEnsureAuthenticated, adminRole, async(req, res) => {
  const userId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [userId]);
    const user = adminResult.rows[0];

      res.render('admin/adminListProducts', {messages: req.flash(), user });
      
    } catch (error) {
      console.error("error getting product list", error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

router.post("/admin/list/product", adminEnsureAuthenticated, adminRole, async (req, res) => {
  const adminId = req.user.id;

  const {
    option1,
    years,
    url,
    country,
    price,
    description,
    loginusername,
    loginemail,
    loginpassword,
    logindetails,
  } = req.body;
  

  try {
    const result = await db.query(
      `INSERT INTO admin_products
       (
      admin_id, years, profile_link,
      account_type, country,
      description, amount,
      payment_status,
      loginusername, loginemail, loginpassword, logindetails ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12 ) 
      RETURNING *`,
      [
        adminId,
        years,
        url,
        option1,
        country,
        description,
        price,
        'not sold',
        loginusername,
        loginemail,
        loginpassword,
        logindetails
      ]
    );
    req.flash("success", "Account listed successfully");
    res.redirect("/admin/list/product");
  } catch (error) {
    console.error("error listing account", error);
    req.flash("error", "Error: listing account was not successfully");
    return res.redirect("/admin/list/product");
  }
});

router.get("/admin/listed/products", adminEnsureAuthenticated, adminRole, async(req, res) => {
  const userId = req.user.id;

  try {
    const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [userId]);
    const user = adminResult.rows[0];

    const limit = 15;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

      const productResult = await db.query(`
        SELECT * FROM admin_products 
        WHERE admin_id = $1 
        ORDER BY created_at DESC LIMIT $2 OFFSET $3`, 
        [userId, limit, offset]);
      const products = productResult.rows;

      products.forEach(products => {
        products.created_at = moment(products.created_at).format('D MMM h:mmA');
        products.amount = numeral(products.amount).format("0,0.00");
      })

      const countQuery = "SELECT COUNT(*) FROM admin_products";
      const countResult = await db.query(countQuery);
      const totalOrders = parseInt(countResult.rows[0].count);

      res.render('admin/listedproductAdmin', {messages: req.flash(), products, 
        currentPage: page, 
        totalPages: Math.ceil(totalOrders / limit), user
       });
      
    } catch (error) {
      console.error("Error getting listed products", error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

router.get("/admin/active/products", adminEnsureAuthenticated, adminRole, async(req, res) => {
    const userId = req.user.id;
    try {

      const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [userId]);
      const user = adminResult.rows[0];

      const limit = 15;
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * limit;

        const productResult = await db.query(`
          SELECT * FROM admin_products 
          WHERE
           admin_id = $1 AND payment_status != $2 
          ORDER BY 
          created_at DESC LIMIT $3 OFFSET $4`, 
          [userId, "sold", limit, offset]);
        const products = productResult.rows;
  
        products.forEach(products => {
          products.created_at = moment(products.created_at).format('D MMM h:mmA');
          products.amount = numeral(products.amount).format("0,0.00");
        })
  
        const countQuery = "SELECT COUNT(*) FROM admin_products WHERE payment_status != $1";
        const countResult = await db.query(countQuery, ["sold"]);
        const totalOrders = parseInt(countResult.rows[0].count);
  
  
        res.render('admin/activeproductsadmin', {messages: req.flash(), products, 
          currentPage: page, 
          totalPages: Math.ceil(totalOrders / limit),
          user
        });
        
      } catch (error) {
        console.error("Error getting active products", error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

 router.get("/admin/sold/products", adminEnsureAuthenticated, adminRole, async(req, res) => {
      const userId = req.user.id;
      try {
        const adminResult = await db.query("SELECT * FROM admins WHERE id = $1", [userId]);
        const user = adminResult.rows[0];

        const limit = 15;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit; 

          const productResult = await db.query('SELECT * FROM admin_products WHERE id = $1 AND payment_status = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4', [userId, "sold", limit, offset]);
          const products = productResult.rows;
    
          products.forEach(products => {
            products.sold_at = moment(products.sold_at).format('D MMM h:mmA');
            products.amount = numeral(products.amount).format("0,0.00");
          })
    
          const countQuery = "SELECT COUNT(*) FROM admin_products WHERE payment_status = $1";
          const countResult = await db.query(countQuery, ["sold"]);
          const totalOrders = parseInt(countResult.rows[0].count);
    
          res.render('admin/soldproductsadmin', {messages: req.flash(), products, 
            currentPage: page, 
            totalPages: Math.ceil(totalOrders / limit), user
           });
          
        } catch (error) {
          console.error("Error sold listed products", error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

router.post("/product/delete/active/account/:id", adminEnsureAuthenticated, adminRole, 
        async (req, res) => {
          const { id } = req.params;
          const productId = Number(id);

            try {

              if (!productId) {
                req.flash("error", "Invalid or missing data.");
                return res.redirect("/admin/active/products");
              }
                await db.query('DELETE FROM admin_products WHERE id = $1', [productId]);

                req.flash("success", "Product has been deleted");
                res.redirect("/admin/active/products");
            } catch (error) {
                console.log("Error deleting product:", error);
                res.status(500).json({ error: 'Internal server error' });
            }
    })

router.post("/product/edit/active/account", adminEnsureAuthenticated, adminRole, 
      async (req, res) => {
        const {productid, productLoginEmail, productAmount, productYear, productAccountCountry, productAccountType, productLoginPassword, 
          productLoginUsername, productDescription, productLoginDetails
        } = req.body;

        const amount = parseFloat(productAmount.replace(/,/g, ''));


        if (!productid || isNaN(amount) || !productLoginEmail) {
          req.flash("error", "Invalid or missing data.");
          return res.redirect("/admin/active/products");
        }    

          try {
            const result = await db.query(`
              UPDATE admin_products 
              SET years = $1,
              account_type = $2, country = $3,
              description = $4, amount = $5,
              loginusername = $6, loginemail = $7, 
              loginpassword = $8, logindetails = $9 WHERE id = $10`, 
              [productYear, productAccountType, productAccountCountry, productDescription, 
               amount, productLoginUsername, productLoginEmail, 
               productLoginPassword, productLoginDetails, productid]);

               req.flash("success", "Account updated successfully");
              res.redirect("/admin/active/products");
          } catch (error) {
              console.log("Error updating product:", error);
              res.status(500).json({ error: 'Internal server error' });
          }
  })

export default router;
