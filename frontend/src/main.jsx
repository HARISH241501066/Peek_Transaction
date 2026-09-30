import React from "react";
import ReactDOM from "react-dom/client";
// Production UI lives in src/ui/. To go back to the original console, import
// "./App.jsx" and "./styles.css" here instead (both files are still in place).
import App from "./ui/AppPro.jsx";
import "./ui/pro.css";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
