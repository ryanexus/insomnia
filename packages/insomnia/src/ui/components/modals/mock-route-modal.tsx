import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Button } from 'react-aria-components';

import { HTTP_METHODS } from '../../../common/constants';
import { Dropdown, DropdownItem, ItemContent } from '../base/dropdown';
import { Modal, type ModalHandle, type ModalProps } from '../base/modal';
import { ModalBody } from '../base/modal-body';
import { ModalFooter } from '../base/modal-footer';
import { ModalHeader } from '../base/modal-header';
import { Icon } from '../icon';

interface State {
  method: (typeof HTTP_METHODS)[number];
  path: string;
  onComplete: (method: (typeof HTTP_METHODS)[number], path: string) => void;
  onHide?: () => void;
}

export interface MockRouteModalOptions {
  onComplete: (method: (typeof HTTP_METHODS)[number], path: string) => void;
  onHide?: () => void;
}

export interface MockRouteModalHandle {
  show: (options: MockRouteModalOptions) => void;
  hide: () => void;
}

const freshState: State = {
  method: HTTP_METHODS[0],
  path: '',
  onComplete: () => {},
  onHide: () => {},
};

export const MockRouteModal = forwardRef<MockRouteModalHandle, ModalProps>((_, ref) => {
  const modalRef = useRef<ModalHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>(freshState);

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement | HTMLButtonElement>) => {
    event.preventDefault();
    state.onComplete?.(state.method, state.path);
    modalRef.current?.hide();
  };
  useImperativeHandle(
    ref,
    () => ({
      hide: () => {
        modalRef.current?.hide();
      },
      show: options => {
        setState({ ...freshState, ...options });
        modalRef.current?.show();
      },
    }),
    [],
  );

  const { method, path } = state;

  const isDisabled = !method || !path;

  return (
    <Modal ref={modalRef} onHide={state.onHide}>
      <ModalHeader>Mock Route</ModalHeader>
      <ModalBody className="wide">
        <form onSubmit={handleSubmit} className="flex flex-row gap-2">
          <Dropdown
            triggerButton={
              <Button className="flex items-center gap-2 p-1 align-middle">
                <span className={`http-method-${method} pt-0.5`}>{method}</span>
                <Icon icon="caret-down" />
              </Button>
            }
          >
            {HTTP_METHODS.map(method => (
              <DropdownItem key={method}>
                <ItemContent
                  className={`http-method-${method}`}
                  label={method}
                  onClick={() => setState(prevState => ({ ...prevState, method }))}
                />
              </DropdownItem>
            ))}
          </Dropdown>
          <input
            ref={inputRef}
            onChange={event => {
              setState(prevState => ({ ...prevState, path: event.target.value }));
            }}
            autoFocus
            defaultValue={state.path}
            id="prompt-input"
            type="text"
            placeholder="Path"
            className="border-1 w-full flex-1 rounded-md border p-1"
          />
        </form>
      </ModalBody>
      <ModalFooter>
        <button className="btn" onClick={handleSubmit} disabled={isDisabled}>
          Create
        </button>
      </ModalFooter>
    </Modal>
  );
});

MockRouteModal.displayName = 'MockRouteModal';
