import { Navigate } from 'react-router-dom';
import {
  PromptsView,
  PromptForm,
  CreatePromptForm,
  EmptyPromptPreview,
} from '~/components/Prompts';
import { ChartsView } from '~/components/Charts';
import { DashboardsView, DashboardEditor, DashboardViewer } from '~/components/Dashboards';
import { SavedQueriesView } from '~/components/SavedQueries';
import { ContextView } from '~/components/Context';
import { AccountPage } from '~/components/Account';
import { AdminPage } from '~/components/Admin';
import DashboardRoute from './Layouts/Dashboard';

const dashboardRoutes = {
  path: 'd/*',
  element: <DashboardRoute />,
  children: [
    /*
    {
      element: <FileDashboardView />,
      children: [
        {
          index: true,
          element: <EmptyVectorStorePreview />,
        },
        {
          path: ':vectorStoreId',
          element: <DataTableFilePreview />,
        },
      ],
    },
    {
      path: 'files/*',
      element: <FilesListView />,
      children: [
        {
          index: true,
          element: <EmptyFilePreview />,
        },
        {
          path: ':fileId',
          element: <FilePreview />,
        },
      ],
    },
    {
      path: 'vector-stores/*',
      element: <VectorStoreView />,
      children: [
        {
          index: true,
          element: <EmptyVectorStorePreview />,
        },
        {
          path: ':vectorStoreId',
          element: <VectorStorePreview />,
        },
      ],
    },
    */
    {
      path: 'prompts/*',
      element: <PromptsView />,
      children: [
        {
          index: true,
          element: <EmptyPromptPreview />,
        },
        {
          path: 'new',
          element: <CreatePromptForm />,
        },
        {
          path: ':promptId',
          element: <PromptForm />,
        },
      ],
    },
    {
      path: 'charts/*',
      element: <ChartsView />,
    },
    {
      path: 'dashboards',
      element: <DashboardsView />,
    },
    {
      path: 'dashboards/:dashboardId',
      element: <DashboardViewer />,
    },
    {
      path: 'dashboards/:dashboardId/edit',
      element: <DashboardEditor />,
    },
    {
      path: 'dashboards/public/:shareId',
      element: <DashboardViewer />,
    },
    {
      path: 'account',
      element: <AccountPage />,
    },
    {
      path: 'admin',
      element: <AdminPage />,
    },
    {
      path: 'saved-queries',
      element: <SavedQueriesView />,
    },
    {
      path: 'context',
      element: <ContextView />,
    },
    {
      path: 'dashboard',
      element: <Navigate to="/d/dashboards" replace={true} />,
    },
    {
      path: 'dahsboard',
      element: <Navigate to="/d/dashboards" replace={true} />,
    },
    {
      path: '*',
      element: <Navigate to="/d/dashboards" replace={true} />,
    },
  ],
};

export default dashboardRoutes;
