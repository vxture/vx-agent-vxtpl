/**
 * Read-only, row and bulk selection examples for management tables.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, SectionHeader, ShellIconButton, ViewHeader } from "../../../ds";
import { ManagementTable } from "../../../framework/management-table";
import { productRoutes } from "../../../framework/product-experience";
import { frameworkSamples, managementPages } from "../catalog";

type SampleMode = typeof managementPages[number]["key"];
type SampleRow = typeof frameworkSamples[number];

export function ManagementSample({ mode }: { mode: SampleMode }) {
  const page = managementPages.find((item) => item.key === mode);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [detail, setDetail] = useState<SampleRow | null>(null);
  const query = filter.trim().toLowerCase();
  const rows = frameworkSamples.filter((row) => `${row.title} ${row.summary}`.toLowerCase().includes(query));

  return (
    <>
      <nav className="management-breadcrumb" aria-label="Breadcrumb">
        <Link href={productRoutes.frameworks}>Framework catalogue</Link><span aria-hidden="true"> / </span>Management
      </nav>
      <ViewHeader title={page?.title ?? "Framework catalogue"} />
      <div className="management-table-heading">
        <SectionHeader title="Frameworks" description={`${rows.length} results`} />
      </div>
      <Input
        className="management-table-filter"
        aria-label="Filter frameworks"
        placeholder="Filter frameworks"
        value={filter}
        onChange={(event) => { setFilter(event.target.value); setDetail(null); }}
      />
      <ManagementTable<SampleRow>
        rows={rows}
        columns={[
          { id: "name", header: "Framework", cell: (row) => <Link href={row.href}>{row.title}</Link> },
          { id: "structure", header: "Structure", cell: (row) => row.summary },
        ]}
        rowKey={(row) => row.key}
        rowLabel={(row) => row.title}
        selection={mode === "catalog" ? undefined : { keys: selected, onChange: setSelected, selectAll: mode === "bulk" }}
        rowActions={(row) => (
          <ShellIconButton
            icon="info"
            label={`About ${row.title}`}
            active={detail === row}
            onClick={() => setDetail((current) => current === row ? null : row)}
          />
        )}
      />
      {detail && (
        <section className="management-row-detail" aria-label={detail.title}>
          <h2>{detail.title}</h2><p>{detail.summary}</p><Link href={detail.href}>Open {detail.title}</Link>
        </section>
      )}
    </>
  );
}
