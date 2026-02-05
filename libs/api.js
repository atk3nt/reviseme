"use client";

import axios from "axios";
import { toast } from "react-hot-toast";
import { signIn } from "next-auth/react";
import config from "@/config";

// use this to interact with our own API (/app/api folder) from the front-end side
// See https://shipfa.st/docs/tutorials/api-call
const apiClient = axios.create({
  baseURL: "/api",
});

apiClient.interceptors.response.use(
  function (response) {
    return response.data;
  },
  function (error) {
    let message = "";

    if (error.response?.status === 401) {
      // Check if we're in dev mode - don't redirect to signin in dev
      const isDev = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('localhost')
      );
      
      if (isDev) {
        // In dev mode, just show error but don't redirect
        message = "Authentication required (dev mode - no redirect)";
      } else {
        // In production, redirect to signin
        toast.error("Please login");
        // automatically redirect to /dashboard page after login
        return signIn(undefined, { callbackUrl: config.auth.callbackUrl });
      }
    } else if (error.response?.status === 403) {
      // User not authorized, must subscribe/purchase/pick a plan
      message = "Pick a plan to use this feature";
    } else {
      message =
        error?.response?.data?.error || error.message || error.toString();
    }

    error.message =
      typeof message === "string" ? message : JSON.stringify(message);

    console.error(error.message);

    // Automatically display errors to the user
    if (error.message) {
      toast.error(error.message);
    } else {
      toast.error("something went wrong...");
    }
    return Promise.reject(error);
  }
);

export default apiClient;
