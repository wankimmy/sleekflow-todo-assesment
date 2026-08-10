"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export default function DocsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">API Docs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Interactive OpenAPI documentation for the TODO REST API. Raw JSON is
          also available at <code>/api/openapi</code>.
        </p>
      </div>
      <div className="h-[calc(100vh-12rem)] min-h-[75vh] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ApiReferenceReact
          configuration={{
            url: "/api/openapi",
          }}
        />
      </div>
    </div>
  );
}
