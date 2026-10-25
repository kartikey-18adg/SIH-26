'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DataMode } from '../types/aiclear';
import { useWorkspace, InstitutionalRole } from '../context/WorkspaceContext';

interface HeaderProps {
  activeMode: DataMode;
  onOpenSettings: () => void;
  onOpenImport: () => void;
  onOpenNewCase: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeMode, onOpenSettings, onOpenImport, onOpenNewCase }) => {
  const pathname = usePathname();
  const { activeRole, setActiveRole, canPerform, roleConfig } = useWorkspace();

  const navItems = [
    { label: 'Workspace', href: '/' },
    { label: 'Cases', href: '/cases' },
    { label: 'Compliance Queue', href: '/compliance' },
    { label: 'Alert Centre', href: '/alerts' },
    { label: 'Task Queue', href: '/tasks' },
  ];

  const isActive = (href: string) => {
    if (!pathname) return href === '/';
    if (href === '/') return pathname === '/' || pathname === '/workspace';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const modeBadge = {
    'DEMO': {
      bg: 'bg-[#FDF6E4]',
      text: 'text-[#855304]',
      border: 'border-[#EBD9A4]',
      label: 'DEMO / SYNTHETIC DATA'
    },
    'IMPORTED': {
      bg: 'bg-[#EAF5EE]',
      text: 'text-[#1C4D35]',
      border: 'border-[#B8DFC8]',
      label: 'IMPORTED WORKSPACE'
    },
    'MANUAL': {
      bg: 'bg-[#EDF2F7]',
      text: 'text-[#2B3B4C]',
      border: 'border-[#CAD6E2]',
      label: 'MANUAL ENTRY MODE'
    },
    'CONNECTED': {
      bg: 'bg-[#FDF0F0]',
      text: 'text-[#8A1E20]',
      border: 'border-[#F0C4C4]',
      label: 'CONNECTED (RESTRICTED)'
    }
  }[activeMode];

  const canCreateCase = canPerform('canCreateCase');
  const canImportData = canPerform('canImportData');
  const canManageSettings = canPerform('canManageSettings');

  return (
    <header className="border-b border-[#E2E0D8] bg-[#FFFFFF] sticky top-0 z-30">
      {/* Top Advisory Banner */}
      <div className="bg-[#1A1917] text-[#E2E0D8] px-4 py-1 text-[11px] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white tracking-wide">AICLEAR</span>
          <span className="text-[#89877E]">|</span>
          <span>Independent Technical Institution Workflow & Compliance Operations System</span>
        </div>
        <div className="text-[10px] text-[#A8A69E]">
          Not an official AICTE portal. Verification against current official APH guidelines required.
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="px-6 py-2.5 flex items-center justify-between border-b border-[#F2F1EC]">
        {/* Left: Brand & Context */}
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-[#1A1917]">AIClear</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 border rounded font-semibold ${modeBadge.bg} ${modeBadge.text} ${modeBadge.border}`}>
                {modeBadge.label}
              </span>
            </div>
            <div className="text-[11px] text-[#5E5D57]">
              Technical Approval Workflow Automation & Evidence Vault
            </div>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 text-xs">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1 font-semibold transition-colors border-b-2 ${
                  active
                    ? 'text-[#1E3A8A] border-[#1E3A8A]'
                    : 'text-[#5E5D57] border-transparent hover:text-[#1A1917] hover:border-[#CAD6E2]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Role Switcher & Controls */}
        <div className="flex items-center gap-3">
          {/* Demo Role Simulator Dropdown */}
          <div 
            className="flex items-center gap-1.5 border border-[#CCD7E2] px-2 py-1 rounded bg-[#F0F5FA] text-[11px]"
            title={`Active Demo Role: ${activeRole} - ${roleConfig.description}`}
          >
            <span className="text-[#475569] font-medium">Role:</span>
            <select
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value as InstitutionalRole)}
              className="bg-transparent font-semibold text-[#0F172A] focus:outline-none cursor-pointer"
            >
              <option value="Institution Coordinator">Institution Coordinator</option>
              <option value="Reviewer">Reviewer</option>
              <option value="Compliance Officer">Compliance Officer</option>
              <option value="Administrator">Administrator</option>
            </select>
          </div>

          {/* Import Data Button */}
          <button
            onClick={canImportData ? onOpenImport : undefined}
            disabled={!canImportData}
            className={`px-2.5 py-1 text-xs border rounded transition-colors flex items-center gap-1.5 ${
              canImportData
                ? 'border-[#C6C4BA] hover:bg-[#F2F1EC] text-[#1A1917] cursor-pointer'
                : 'border-[#E2E0D8] bg-[#F7F7F5] text-[#A8A69E] cursor-not-allowed'
            }`}
            title={canImportData ? "Import Institutional Dossier" : "Data import restricted to Institution Coordinator or Administrator"}
          >
            <span>📥 Import Data</span>
          </button>

          {/* Data Sources Button */}
          <button
            onClick={canManageSettings ? onOpenSettings : undefined}
            disabled={!canManageSettings}
            className={`px-2.5 py-1 text-xs border rounded transition-colors flex items-center gap-1.5 ${
              canManageSettings
                ? 'border-[#C6C4BA] hover:bg-[#F2F1EC] text-[#1A1917] cursor-pointer'
                : 'border-[#E2E0D8] bg-[#F7F7F5] text-[#A8A69E] cursor-not-allowed'
            }`}
            title={canManageSettings ? "Configure Data Sources" : "Data source configuration restricted to Administrator"}
          >
            <span>⚙ Data Sources</span>
          </button>

          {/* New Case Button */}
          <button
            onClick={canCreateCase ? onOpenNewCase : undefined}
            disabled={!canCreateCase}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              canCreateCase
                ? 'text-white bg-[#1E3A8A] hover:bg-[#172554] cursor-pointer'
                : 'text-[#89877E] bg-[#E2E0D8] cursor-not-allowed'
            }`}
            title={canCreateCase ? "Initialize new approval case" : "Case initialization restricted to Institution Coordinator or Administrator"}
          >
            + Create Case
          </button>
        </div>
      </div>

      {/* Role Context Strip (Subtle banner indicating current role simulation) */}
      <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 py-1 text-[11px] text-[#475569] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#1E3A8A]">Simulated Role:</span>
          <span className="font-medium text-[#0F172A]">{activeRole}</span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="text-[#64748B] italic">{roleConfig.focusArea}</span>
        </div>
        <div className="text-[10px] text-[#64748B]">
          {roleConfig.description}
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden overflow-x-auto px-4 py-1.5 border-b border-[#E2E0D8] bg-[#FAF9F5] gap-2 text-xs">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[#1E3A8A] text-white font-bold'
                  : 'bg-[#FFFFFF] border border-[#E2E0D8] text-[#5E5D57]'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
};
