"use client";

import React from "react";

import { readAdminBasePath } from "@/lib/admin-path";

export function useAdminBasePath(): string {
  const [base, setBase] = React.useState("");
  React.useEffect(() => {
    setBase(readAdminBasePath());
  }, []);
  return base;
}
