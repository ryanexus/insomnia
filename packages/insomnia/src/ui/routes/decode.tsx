import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import React, { type FC, useRef, useState } from 'react';
import { Breadcrumb, Breadcrumbs } from 'react-aria-components';
import { Button, GridList, GridListItem, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { type ImperativePanelGroupHandle, Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { NavLink, useParams, useRevalidator, useRouteLoaderData } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

import { DEFAULT_SIDEBAR_SIZE } from '../../common/constants';
import { DocumentTab } from '../components/document-tab';
import { WorkspaceDropdown } from '../components/dropdowns/workspace-dropdown';
import { Icon } from '../components/icon';
import { INSOMNIA_TAB_HEIGHT } from '../constant';
import type { WorkspaceLoaderData } from './workspace';

const generatePrompt = `
Here is an OpenAPI spec.

I'd like you to generate a custom server using pure NodeJS v22 code in a single .js file with no external dependencies that includes:

- validation of request body and query parameters, with as much adherence to the descriptions in the spec as possible
- attempt to use a random free port above 10000 up to 10 times before giving up, and only output the status in structured JSON when giving up
- in-memory storage, no value mocking
- make sure the endpoints behave as they should given the descriptions in the spec
- output the port number used to the console in structured JSON when the server starts
- make this as simple as possible, do not use this spec in the code directly
- make sure the path used to call the endpoints is preserved in any reference links, and include the used hostname and base url in those links
- consider any server urls to make sure calling with the base path will also work in addition to the naked paths in the spec

Please only send code, no other text.

`;
interface Server {
  id: string;
  name: string;
  state: string;
  port?: number;
}

const Decode: FC = () => {
  const { organizationId, projectId, workspaceId } = useParams() as {
    organizationId: string;
    projectId: string;
    workspaceId: string;
  };

  const { activeProject } = useRouteLoaderData(':workspaceId') as WorkspaceLoaderData;
  const { revalidate } = useRevalidator();

  // State and handlers from InstaMockList
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [serverCount, setServerCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const handleDelete = (id: string) => {
    setServers(prevServers => prevServers.filter(server => server.id !== id));
  };

  const handleStart = async (id: string) => {
    setServers(prevServers =>
      prevServers.map(server => (server.id === id ? { ...server, state: 'starting' } : server)),
    );
    const firstLine = await window.main.startMockServer({ id, workspaceId });
    try {
      const serverInfo = JSON.parse(`${firstLine}`);
      setServers(prevServers =>
        prevServers.map(server => (server.id === id ? { ...server, state: 'running', port: serverInfo.port } : server)),
      );
    } catch (error) {
      console.error(error);
      setServers(prevServers =>
        prevServers.map(server => (server.id === id ? { ...server, state: 'failed' } : server)),
      );
    }
    revalidate();
  };

  const handleStop = async (id: string) => {
    setServers(prevServers =>
      prevServers.map(server => (server.id === id ? { ...server, state: 'stopping' } : server)),
    );
    const stopped = await window.main.stopMockServer({ id });
    if (stopped) {
      setServers(prevServers =>
        prevServers.map(server => (server.id === id ? { ...server, state: 'stopped' } : server)),
      );
    } else {
      setServers(prevServers =>
        prevServers.map(server => (server.id === id ? { ...server, state: 'running' } : server)),
      );
    }
  };

  const handleNewMockServer = () => {
    setServerCount(prevServerCount => prevServerCount + 1);
    const id = uuidv4();
    setServers(prevServers => {
      return [...prevServers, { id, name: `Server ${serverCount + 1}`, state: 'created' }];
    });
    setSelectedServers([`${id}`]);
  };

  const serverActionList = [
    {
      id: 'start',
      name: 'Start',
      icon: 'play',
      action: handleStart,
    },
    {
      id: 'stop',
      name: 'Stop',
      icon: 'stop',
      action: handleStop,
    },
    {
      id: 'delete',
      name: 'Delete',
      icon: 'trash',
      action: handleDelete,
    },
  ];
  // End of state and handlers from InstaMockList

  const sidebarPanelRef = useRef<ImperativePanelGroupHandle>(null);

  const selectedServer = servers.find(server => server.id === selectedServers[0]);

  const generateMockServer = async () => {
    setServers(prevServers =>
      prevServers.map(server => (server.id === selectedServer?.id ? { ...server, state: 'generating' } : server)),
    );
    setGenerating(true);
    const generated = await window.main.generateMockServer({
      id: selectedServer!.id,
      workspaceId,
    });
    await new Promise(resolve => setTimeout(resolve, 2500));
    setGenerating(false);
    if (generated) {
      setServers(prevServers =>
        prevServers.map(server => (server.id === selectedServer?.id ? { ...server, state: 'stopped' } : server)),
      );
    } else {
      setServers(prevServers =>
        prevServers.map(server => (server.id === selectedServer?.id ? { ...server, state: 'failed' } : server)),
      );
    }
  };

  return (
    <PanelGroup
      ref={sidebarPanelRef}
      autoSaveId="insomnia-sidebar"
      id="wrapper"
      className="new-sidebar h-ful w-full text-[--color-font]"
      direction="horizontal"
    >
      <Panel
        id="sidebar"
        className="sidebar theme--sidebar"
        defaultSize={DEFAULT_SIDEBAR_SIZE}
        maxSize={40}
        minSize={10}
        style={{ minWidth: '275px' }}
        // collapsible
      >
        <div className="flex h-full flex-col divide-y divide-solid divide-[--hl-md] overflow-hidden">
          <Breadcrumbs
            className={`flex h-[${INSOMNIA_TAB_HEIGHT}px] m-0 w-full list-none items-center gap-2 px-[--padding-sm] font-bold`}
          >
            <Breadcrumb className="flex h-full select-none items-center gap-2 text-[--color-font] outline-none data-[focused]:outline-none">
              <NavLink
                data-testid="project"
                className="flex aspect-square h-7 flex-shrink-0 items-center justify-center gap-2 rounded-sm px-1 py-1 text-sm text-[--color-font] outline-none ring-1 ring-transparent transition-all hover:bg-[--hl-xs] focus:ring-inset focus:ring-[--hl-md] aria-pressed:bg-[--hl-sm] data-[focused]:outline-none"
                to={`/organization/${organizationId}/project/${activeProject._id}`}
              >
                <Icon className="text-xs" icon="chevron-left" />
              </NavLink>
              <span aria-hidden role="separator" className="h-4 text-[--hl-lg] outline outline-1" />
            </Breadcrumb>
            <Breadcrumb className="flex h-full select-none items-center gap-2 truncate text-[--color-font] outline-none data-[focused]:outline-none">
              <WorkspaceDropdown />
            </Breadcrumb>
          </Breadcrumbs>
          <DocumentTab
            organizationId={organizationId}
            projectId={projectId}
            workspaceId={workspaceId}
            className="border-b border-solid border-[--hl-sm]"
          />
          <GridList
            aria-label="Mock Servers"
            items={servers}
            className="overflow-y-auto py-[--padding-sm] data-[empty]:py-0"
            disallowEmptySelection
            selectedKeys={selectedServers}
            selectionMode="single"
            onSelectionChange={keys => {
              if (keys !== 'all') {
                const value = keys.values().next().value;
                if (value === 'new') {
                  handleNewMockServer();
                } else {
                  setSelectedServers([`${value}`]);
                }
              }
            }}
          >
            {server => {
              return (
                <GridListItem
                  aria-label={server.name}
                  key={server.id}
                  id={server.id}
                  textValue={server.name}
                  className="group flex h-[--line-height-xs] w-full select-none items-center justify-between overflow-hidden px-4 text-[--hl] outline-none transition-colors hover:bg-[--hl-xs] focus:bg-[--hl-sm] data-[focused]:outline-none"
                >
                  <span className="items-center truncate">
                    {server.name}{' '}
                    {server.state === 'running' && (
                      <span
                        className={`ml-2 items-center rounded-full bg-[--color-surprise] px-1.5 py-1 text-xs font-semibold uppercase text-[--color-font-surprise]`}
                      >
                        active
                      </span>
                    )}
                  </span>

                  <MenuTrigger>
                    <Button
                      aria-label="Instance Mock Server Actions"
                      className="flex aspect-square h-6 items-center justify-center rounded-sm text-sm text-[--color-font] opacity-0 ring-1 ring-transparent transition-all hover:bg-[--hl-xs] hover:opacity-100 focus:opacity-100 focus:ring-inset focus:ring-[--hl-md] group-hover:opacity-100 group-focus:opacity-100 data-[pressed]:bg-[--hl-sm] data-[pressed]:opacity-100"
                    >
                      <Icon icon="caret-down" />
                    </Button>
                    <Popover className="flex min-w-max flex-col overflow-y-hidden">
                      <Menu
                        aria-label="Instance Mock Server Actions Menu"
                        selectionMode="single"
                        onAction={key => {
                          serverActionList.find(({ id }) => key === id)?.action(server.id);
                        }}
                        items={serverActionList}
                        className="min-w-max select-none overflow-y-auto rounded-md border border-solid border-[--hl-sm] bg-[--color-bg] py-2 text-sm shadow-lg focus:outline-none"
                      >
                        {menuItem => {
                          const isDisabled =
                            (menuItem.id === 'start' && ['running', 'created'].includes(server.state)) ||
                            (menuItem.id === 'stop' && ['stopped', 'created'].includes(server.state)) ||
                            (menuItem.id === 'delete' && server.state === 'running');
                          // merge the class name with greyed out text
                          const extraStyles = isDisabled ? 'text-gray-500' : '';
                          return (
                            <MenuItem
                              key={menuItem.id}
                              id={menuItem.id}
                              className={`${extraStyles} text-md flex h-[--line-height-xs] w-full cursor-pointer items-center gap-2 whitespace-nowrap bg-transparent px-[--padding-md] text-[--color-font] transition-colors hover:bg-[--hl-sm] focus:bg-[--hl-xs] focus:outline-none disabled:cursor-not-allowed aria-selected:font-bold`}
                              aria-label={menuItem.name}
                              isDisabled={isDisabled}
                              aria-title={isDisabled ? 'This action is not available for this server state' : ''}
                            >
                              <Icon icon={menuItem.icon as IconProp} />
                              <span>{menuItem.name}</span>
                            </MenuItem>
                          );
                        }}
                      </Menu>
                    </Popover>
                  </MenuTrigger>
                </GridListItem>
              );
            }}
          </GridList>
          <div className="flex flex-grow flex-row items-start justify-center">
            <Button
              onPress={handleNewMockServer}
              className="my-3 rounded-md bg-[--color-surprise] px-3 py-1 text-[--color-font-surprise] hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-[--color-surprise] focus:ring-opacity-50"
            >
              Create New Mock Server
            </Button>
          </div>
        </div>
      </Panel>
      <PanelResizeHandle className="h-full w-[1px] bg-[--hl-md]" />
      <Panel className="flex h-full flex-1 flex-col items-center justify-center">
        {generating ? (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <p className="text-lg font-medium text-[--color-font]">Generating mock server...</p>
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center">
            <p className="text-lg font-medium text-[--color-font]">No mock servers created yet.</p>
            <Button
              onPress={handleNewMockServer}
              className="mt-4 rounded-md bg-[--color-surprise] px-4 py-2 text-[--color-font-surprise] hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-[--color-surprise] focus:ring-opacity-50"
            >
              Create New Mock Server
            </Button>
          </div>
        ) : selectedServers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="text-lg font-medium text-[--color-font]">Select a mock server to view status.</p>
          </div>
        ) : (
          selectedServer && (
            <div className="flex h-full w-full flex-col items-start justify-start p-[--padding-md]">
              <p className="text-lg font-medium text-[--color-font]">Mock Server: {selectedServer.name}</p>
              <p className="text-lg font-medium text-[--color-font]">Status: {selectedServer.state}</p>
              {selectedServer.state === 'running' && (
                <p className="text-lg font-medium text-[--color-font]">
                  Port:{' '}
                  <span className="rounded-full bg-[--color-surprise] px-2 text-[.94rem] font-semibold uppercase text-[--color-font-surprise]">
                    {selectedServer.port}
                  </span>
                </p>
              )}
              {selectedServer.state === 'stopped' && (
                <Button
                  className="mt-4 rounded-md bg-[--color-surprise] px-4 py-2 text-[--color-font-surprise] hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-[--color-surprise] focus:ring-opacity-50"
                  onPress={() => handleStart(selectedServer.id)}
                >
                  Start Mock Server
                </Button>
              )}
              {selectedServer.state === 'running' && (
                <Button
                  className="mt-4 rounded-md bg-[--color-surprise] px-4 py-2 text-[--color-font-surprise] hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-[--color-surprise] focus:ring-opacity-50"
                  onPress={() => handleStop(selectedServer.id)}
                >
                  Stop Mock Server
                </Button>
              )}
              {selectedServer.state === 'created' && (
                <div className="mt-4">
                  <h2 className="text-lg font-medium text-[--color-font]">Generate Mock Server with Insomnia AI</h2>
                  <span className="mt-2 text-sm text-[--color-font]">
                    This will utilise Insomnia AI to generate a functional mock server based on the OpenAPI
                    specification.
                  </span>
                  <h2 className="mt-2 text-lg font-medium text-[--color-font]">Prompt:</h2>
                  <pre>
                    <code className="mt-2 rounded-md border border-solid border-[--hl-sm] p-2 text-[--color-font]">
                      {generatePrompt}
                    </code>
                  </pre>
                  <Button
                    onPress={() => generateMockServer()}
                    className="mt-4 rounded-md bg-[--color-surprise] px-4 py-2 text-[--color-font-surprise] hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-[--color-surprise] focus:ring-opacity-50"
                  >
                    Generate Mock Server
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </Panel>
    </PanelGroup>
  );
};

export default Decode;
