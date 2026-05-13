export function Step5ApplianceStatus() {
  return (
    <div className="space-y-[13px]">
      {/* Empty state */}
      <div className="bg-white rounded-xl border border-[rgba(15,41,82,0.08)] shadow-[0_1px_3px_rgba(15,41,82,0.08),0_1px_2px_rgba(15,41,82,0.05)] p-12 text-center">
        <div className="text-[28px] mb-2">🖥</div>
        <div className="font-semibold text-[13px] text-[#0F172A] mb-1">No appliances configured</div>
        <div className="text-xs text-[#64748B]">
          Enable V-Series in Step 2 and add connection details in Step 3.
        </div>
      </div>
    </div>
  );
}
