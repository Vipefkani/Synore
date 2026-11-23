import React, { useState } from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { AuthScreen, OnboardingWizard } from './components/AuthAndOnboarding';
import { AppShell } from './components/AppShell';
import { HomeDashboard } from './components/modules/HomeDashboard';
import { CommunicationModule } from './components/modules/CommunicationModule';
import { ProjectsModule } from './components/modules/ProjectsModule';
import { TasksModule } from './components/modules/TasksModule';
import { DocumentsAndKbModule } from './components/modules/DocumentsAndKbModule';
import { FilesModule } from './components/modules/FilesModule';
import { CalendarAndMeetingsModule } from './components/modules/CalendarAndMeetingsModule';
import { TeamModule } from './components/modules/TeamModule';
import { AnalyticsModule } from './components/modules/AnalyticsModule';
import { SettingsAndBillingModule } from './components/modules/SettingsAndBillingModule';

function SynoreRouter() {
  const { token, user, workspaces, activeWorkspace, activeView } = useWorkspace();
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  if (!token || !user) {
    return <AuthScreen />;
  }

  if (workspaces.length === 0 || creatingWorkspace) {
    return (
      <OnboardingWizard
        allowCancel={workspaces.length > 0}
        onCancel={() => setCreatingWorkspace(false)}
      />
    );
  }

  return (
    <AppShell onStartNewWorkspace={() => setCreatingWorkspace(true)}>
      {activeWorkspace && (
        <>
          {activeView === 'home' && <HomeDashboard />}
          {activeView === 'messages' && <CommunicationModule initialMode="messages" />}
          {activeView === 'channels' && <CommunicationModule initialMode="channels" />}
          {activeView === 'projects' && <ProjectsModule />}
          {activeView === 'tasks' && <TasksModule />}
          {activeView === 'documents' && <DocumentsAndKbModule mode="documents" />}
          {activeView === 'knowledge' && <DocumentsAndKbModule mode="knowledge" />}
          {activeView === 'calendar' && <CalendarAndMeetingsModule mode="calendar" />}
          {activeView === 'files' && <FilesModule />}
          {activeView === 'meetings' && <CalendarAndMeetingsModule mode="meetings" />}
          {activeView === 'team' && <TeamModule />}
          {activeView === 'analytics' && <AnalyticsModule />}
          {activeView === 'settings' && <SettingsAndBillingModule />}
        </>
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <SynoreRouter />
    </WorkspaceProvider>
  );
}
