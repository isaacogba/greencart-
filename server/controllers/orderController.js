import Order from "../models/Order.js";
import Product from "../models/Product.js";
import axios from "axios";
import crypto from "crypto";

// Place Order COD : /api/order/cod
export const placeOrderCOD = async (req, res) => {
  try {
    const { items, address } = req.body;
    const userId = req.userId;
    if (!address || items.length === 0) {
      return res.json({ success: false, message: "Invalid data" });
    }
    // Calculate Amount Using Items
    let amount = await items.reduce(async (acc, item) => {
      const product = await Product.findById(item.product);
      return (await acc) + product.offerPrice * item.quantity;
    }, 0);

    // Add Tax Charge (2%)
    amount += Math.floor(amount * 0.02);

    await Order.create({
      userId,
      items,
      amount,
      address,
      paymentType: "COD",
    });

    return res.json({ success: true, message: "Order Placed Successfully" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

// Initialize Paystack Payment : /api/order/paystack-init
export const initializePayment = async (req, res) => {
  try {
    const { items, address, email, amount } = req.body;
    const userId = req.userId;

    if (!address || items.length === 0 || !email) {
      return res.json({ success: false, message: "Invalid data" });
    }

    // Initialize Paystack payment
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(amount * 100), // Paystack expects amount in kobo (multiply by 100)
        callback_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/cart`,
        channels: ["card"],
        metadata: {
          userId,
          items,
          address,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    if (response.data.status) {
      const reference = response.data.data.reference;
      await Order.create({
        userId,
        items,
        amount,
        address,
        paymentType: "Paystack",
        reference,
        isPaid: false,
      });
      return res.json({
        success: true,
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference,
      });
    } else {
      return res.json({
        success: false,
        message: "Failed to initialize payment",
      });
    }
  } catch (error) {
    console.log(error.message);
    return res.json({ success: false, message: error.message });
  }
};

// Verify Paystack Payment : /api/order/paystack-verify
export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.json({ success: false, message: "Invalid reference" });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    if (response.data.status && response.data.data.status === "success") {
      const { metadata } = response.data.data;
      const { items, address, userId: metadataUserId } = metadata;
      const orderReference = response.data.data.reference;
      const orderAmount = response.data.data.amount / 100;

      const existingOrder = await Order.findOne({ reference: orderReference });
      if (existingOrder) {
        if (!existingOrder.isPaid) {
          existingOrder.isPaid = true;
          existingOrder.status = "Payment Completed";
          await existingOrder.save();
        }
      } else {
        await Order.create({
          userId: metadataUserId,
          items,
          amount: orderAmount,
          address,
          paymentType: "Paystack",
          reference: orderReference,
          isPaid: true,
        });
      }

      return res.json({
        success: true,
        message: "Payment verified and order created successfully",
      });
    } else {
      return res.json({
        success: false,
        message: "Payment verification failed",
      });
    }
  } catch (error) {
    console.log(error.message);
    return res.json({ success: false, message: error.message });
  }
};

// Paystack webhook endpoint
export const handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET;

    if (!signature || !secret) {
      return res
        .status(400)
        .send("Webhook signature missing or secret not configured");
    }

    const hash = crypto
      .createHmac("sha512", secret)
      .update(req.rawBody)
      .digest("hex");

    if (signature !== hash) {
      return res.status(400).send("Invalid webhook signature");
    }

    const event = req.body;
    if (event.event === "charge.success") {
      const { reference, amount, metadata } = event.data;
      const existingOrder = await Order.findOne({ reference });
      if (existingOrder) {
        if (!existingOrder.isPaid) {
          existingOrder.isPaid = true;
          existingOrder.status = "Payment Completed";
          await existingOrder.save();
        }
      } else {
        const { items, address, userId: metadataUserId } = metadata;
        await Order.create({
          userId: metadataUserId,
          items,
          amount: amount / 100,
          address,
          paymentType: "Paystack",
          reference,
          isPaid: true,
          status: "Payment Completed",
        });
      }
    }

    return res.status(200).send("Ok");
  } catch (error) {
    console.log(error.message);
    return res.status(500).send("Webhook handler error");
  }
};

// Get Orders by User ID : /api/order/user
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.userId;
    const orders = await Order.find({
      userId,
      $or: [{ paymentType: "COD" }, { isPaid: true }],
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get All Orders ( for seller / admin) : /api/order/seller
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ paymentType: "COD" }, { isPaid: true }],
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
