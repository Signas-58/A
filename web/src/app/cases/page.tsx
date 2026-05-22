import React, { useEffect, useState } from "react";
import type { NextPage } from "next";


type Report = {
  id: number;
  case_number: string;
  investigator_id: number;
  prosecutor_id: number;
  pdf_hash: string;
  created_at: string;
};

const CasesPage: NextPage = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Assuming auth token handling is done elsewhere; this is a simple fetch example
    fetch("/reports")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setReports(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-4">Loading cases…</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My Cases</h1>
      <table className="table glass-card">
        <thead>
          <tr>
            <th>Case #</th>
            <th>Investigator</th>
            <th>Prosecutor</th>
            <th>Created</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td>{r.case_number}</td>
              <td>{r.investigator_id}</td>
              <td>{r.prosecutor_id}</td>
              <td>{new Date(r.created_at).toLocaleDateString()}</td>
              <td>
                <a
                  href={`/reports/${r.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View PDF
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CasesPage;
