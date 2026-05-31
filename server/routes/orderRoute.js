import express from "express";
import authUser from "../middlewares/authUser.js";
import {
  getAllOrders,
  getUserOrders,
  placeOrderCOD,
  initializePayment,
  verifyPayment,
  handlePaystackWebhook,
} from "../controllers/orderController.js";
import authSeller from "../middlewares/authSeller.js";

const orderRouter = express.Router();

orderRouter.post("/cod", authUser, placeOrderCOD);
orderRouter.post("/paystack-init", authUser, initializePayment);
orderRouter.post("/paystack-verify", authUser, verifyPayment);
orderRouter.post("/webhook", handlePaystackWebhook);
orderRouter.get("/user", authUser, getUserOrders);
orderRouter.get("/seller", authSeller, getAllOrders);

export default orderRouter;
