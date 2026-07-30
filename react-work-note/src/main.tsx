import React from "react";
import ReactDOM from "react-dom/client";
import { FullstackRoot } from "./fullstack/FullstackRoot";
import "./styles.css";
import "./fullstack/fullstack.css";
import "./fullstack/drive-organization.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FullstackRoot />
  </React.StrictMode>
);
