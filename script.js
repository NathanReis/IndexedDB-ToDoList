const DB = (() => {
  const DB_NAME = 'todo_list';
  const DB_VERSION = 1;

  const STATUSES = Object.freeze({
    in_progress: 'in progress',
    error: 'error',
    complete: 'complete',
  });

  function init() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('DB: failed to open connection', event);

      currentStatus = STATUSES.error;
    };

    request.onupgradeneeded = (event) => {
      console.log('DB: updated version', event);

      connection = event.target.result;

      setup();
    };

    request.onsuccess = (event) => {
      console.log('DB: connection opened successfully', event);

      if (!connection) {
        connection = event.target.result;
      }

      printAllTasks();

      currentStatus = STATUSES.complete;
    };
  }

  function setup() {
    console.log('DB: configuring TODO list...');

    connection.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
  }

  function printAllTasks() {
    const store = connection.transaction('tasks').objectStore('tasks');
    const request = store.getAll();

    request.onsuccess = (event) => {
      event.target.result.forEach(tasksList.createNewItem);
    }
  }

  let connection;
  let currentStatus;

  return Object.freeze({
    startConnection() {
      return this.getConnection();
    },

    getConnection() {
      if (connection) {
        return connection;
      }

      if (!currentStatus) {
        currentStatus = STATUSES.in_progress;

        init();
      }

      if (currentStatus === STATUSES.in_progress) {
        console.log('Opening connection...');
      }
    },
  });
})();

const Model = (() => {
  const ACTIONS_LOG_MSG = Object.freeze({
    create: Object.freeze({
      error({ storeName }) {
        return `CREATE: failed to create ${storeName}`;
      },

      success({ storeName, key }) {
        return `CREATE: new ${storeName} created with key ${key}`;
      },

      complete({ storeName }) {
        return `CREATE: new ${storeName} complete`;
      },
    }),
    update: Object.freeze({
      error({ storeName }) {
        return `UPDATE: failed to update ${storeName}`;
      },

      success({ storeName, key }) {
        return `UPDATE: key ${key} in ${storeName} updated`;
      },

      complete({ storeName }) {
        return `UPDATE: update in ${storeName} complete`;
      },
    }),
    find: Object.freeze({
      error({ storeName }) {
        return `FIND: failed to find ${storeName}`;
      },

      success({ storeName, result }) {
        return result
          ? `FIND: ${JSON.stringify(result)} found in ${storeName}`
          : `FIND: nothing found in ${storeName}`;
      },

      complete({ storeName }) {
        return `FIND: find ${storeName} complete`;
      },
    }),
    delete: Object.freeze({
      error({ storeName }) {
        return `DELETE: failed to delete ${storeName}`;
      },

      success({ storeName }) {
        return `DELETE: delete in ${storeName}`;
      },

      complete({ storeName }) {
        return `DELETE: delete in ${storeName} complete`;
      },
    }),
  });

  function setupTransactionAndStore({ action, storeName, transactionType, errorCallback, completeCallback, transaction, store }) {
    if (!store) {
      const hasTransaction = !!transaction;

      if (!hasTransaction) {
        transaction = DB.getConnection().transaction(storeName, transactionType);
      }

      store = transaction.objectStore(storeName);

      if (!hasTransaction) {
        setupTransaction({ action, storeName, errorCallback, completeCallback, transaction, store });
      }
    }

    return [transaction, store];
  }

  function setupTransaction({ action, storeName, errorCallback, completeCallback, transaction, store }) {
    transaction.onerror = (event) => {
      console.error(ACTIONS_LOG_MSG[action].error({ storeName }), event);

      if (errorCallback) errorCallback({ event, transaction, store });
    };

    transaction.oncomplete = (event) => {
      const key = event.target.result;

      console.log(ACTIONS_LOG_MSG[action].complete({ storeName }), event);

      if (completeCallback) completeCallback({ key, event, transaction, store });
    };
  }

  return Object.freeze({
    create({ storeName, object, errorCallback, successCallback, completeCallback, ...rest }) {
      const ACTION = 'create';

      let {
        transaction,
        store,
      } = rest;

      [transaction, store] = setupTransactionAndStore({
        action: ACTION,
        storeName,
        transactionType: 'readwrite',
        errorCallback,
        completeCallback,
        transaction,
        store,
      });

      const request = store.add(object);

      request.onsuccess = (event) => {
        const key = event.target.result;

        console.log(ACTIONS_LOG_MSG[ACTION].success({ storeName, key }), event);

        if (successCallback) successCallback({ key, event, transaction, store });
      };
    },

    update({ storeName, object, errorCallback, successCallback, completeCallback, ...rest }) {
      const ACTION = 'update';

      let {
        transaction,
        store,
      } = rest;

      [transaction, store] = setupTransactionAndStore({
        action: ACTION,
        storeName,
        transactionType: 'readwrite',
        errorCallback,
        completeCallback,
        transaction,
        store,
      });

      const request = store.put(object);

      request.onsuccess = (event) => {
        const key = event.target.result;

        console.log(ACTIONS_LOG_MSG[ACTION].success({ storeName, key }), event);

        if (successCallback) successCallback({ key, event, transaction, store });
      };
    },

    findByKey({ storeName, key, transactionType, errorCallback, successCallback, completeCallback, ...rest }) {
      const ACTION = 'find';

      if (!transactionType) {
        transactionType = 'readonly';
      }

      let {
        transaction,
        store,
      } = rest;

      [transaction, store] = setupTransactionAndStore({
        action: ACTION,
        storeName,
        transactionType,
        errorCallback,
        completeCallback,
        transaction,
        store,
      });

      const request = store.get(key);

      request.onsuccess = (event) => {
        const { result } = event.target;

        console.log(ACTIONS_LOG_MSG[ACTION].success({ storeName, result }), event);

        if (successCallback) successCallback({ result, store, event, transaction, store });
      };
    },

    delete({ storeName, key, errorCallback, successCallback, completeCallback, ...rest }) {
      const ACTION = 'delete';

      let {
        transaction,
        store,
      } = rest;

      [transaction, store] = setupTransactionAndStore({
        action: ACTION,
        storeName,
        transactionType: 'readwrite',
        errorCallback,
        completeCallback,
        transaction,
        store,
      });

      const request = store.delete(key);

      request.onsuccess = (event) => {
        const { result } = event.target;

        console.log(ACTIONS_LOG_MSG[ACTION].success({ storeName, result }), event);

        if (successCallback) successCallback({ result, store, event, transaction, store });
      };
    },
  });
})();

const Task = (() => {
  const STORE_NAME = 'tasks';

  return Object.freeze({
    create({ object, ...rest}) {
      object.created_at = new Date().toISOString();
      object.updated_at = null;
      object.completed_at = null;

      Model.create({ ...rest, storeName: STORE_NAME, object });
    },

    update({ key, object, skipFind, ...rest }) {
      object.updated_at = new Date().toISOString();

      if (skipFind) {
        Model.update({ ...rest, storeName: STORE_NAME, object });
      } else {
        this.findByKey({
          key,
          successCallback({ result, event }) {
            Model.update({ ...rest, storeName: STORE_NAME, object: { ...result, ...object } });
          },
        });
      }
    },

    findByKey(params) {
      Model.findByKey({ ...params, storeName: STORE_NAME });
    },

    delete(params) {
      Model.delete({ ...params, storeName: STORE_NAME });
    },
  });
})();

const tasksList = (() => {
  const LIST_ITEM_ID_PREFIX = 'list_task_';

  const list = document.getElementById('list-tasks');

  function buildItem({ object }) {
    const itemTemplate = document.getElementById('list-task-item-template');
    const itemClone = itemTemplate.content.cloneNode(true);

    const newItem = itemClone.firstElementChild;
    newItem.id = newItem.id.replace('{{taskId}}', object.id);

    const titleElement = newItem.getElementsByClassName('list-task-title')[0];
    titleElement.textContent = titleElement.textContent
      .replace('{{taskId}}', object.id)
      .replace('{{taskTitle}}', object.title);

    const createdAtElement = newItem.getElementsByClassName('list-task-created-at')[0];
    createdAtElement.textContent = createdAtElement.textContent
      .replace('{{taskCreatedAt}}', formatDate(object.created_at));

    const updatedAtElement = newItem.getElementsByClassName('list-task-updated-at')[0];

    if (object.updated_at) {
      updatedAtElement.textContent = updatedAtElement.textContent
        .replace('{{taskUpdatedAt}}', formatDate(object.updated_at));
    } else {
      updatedAtElement.remove();
    }

    const completedAtElement = newItem.getElementsByClassName('list-task-completed-at')[0];

    if (object.completed_at) {
      completedAtElement.textContent = completedAtElement.textContent
        .replace('{{taskCompletedAt}}', formatDate(object.completed_at));
    } else {
      completedAtElement.remove();
    }

    return itemClone;
  }

  function formatDate(date) {
    return new Date(date).toLocaleString();
  }

  return Object.freeze({
    createNewItem(object) {
      list.appendChild(buildItem({ object }));
    },

    updateItem(object) {
      const id = object.id;
      const item = document.getElementById(`${LIST_ITEM_ID_PREFIX}${id}`);

      item.replaceWith(buildItem({ object }));
    },

    deleteItem(id) {
      const item = document.getElementById(`${LIST_ITEM_ID_PREFIX}${id}`);
      list.removeChild(item);
    },

    extractItemId(item) {
      return item.id.replace(LIST_ITEM_ID_PREFIX, '');
    },
  });
})();

const handleFormReset = (() => {
  const completedContainer = document.getElementById('form-task-completed').closest('.form-control');
  const submitBtn = document.querySelector('#form-task button[type="submit"]');

  return (event) => {
    submitBtn.classList.add('btn-success');
    submitBtn.classList.remove('btn-warning');

    completedContainer.classList.add('hidden');
  };
})();

const handleTaskSubmit = (() => {
  const form = document.getElementById('form-task');

  function afterSuccessCreate(object, { event }) {
    object.id = event.target.result;

    tasksList.createNewItem(object);
    form.reset();
  }

  function afterSuccessUpdate(object, params) {
    tasksList.updateItem(object);
    form.reset();
  }

  return (event) => {
    event.preventDefault();

    const id = Number(document.getElementById('form-task-id').value);
    const title = document.getElementById('form-task-title').value.trim();
    const completed = document.getElementById('form-task-completed').checked;

    if (!title) {
      throw new Error('title is required');
    }

    const object = { title };

    if (id) object.id = id;

    if (completed) {
      object.completed_at = new Date().toISOString();
    } else {
      object.completed_at = null;
    }

    if (id) {
      Task.update({
        key: id,
        object,
        successCallback(params) {
          Task.findByKey({
            key: id,
            successCallback({ result, ...rest }) { afterSuccessUpdate(result, rest) },
          });
        },
      });
    } else {
      Task.create({
        object,
        successCallback(params) { afterSuccessCreate(object, params) },
      });
    }
  };
})();

const handleIdChange = (() => {
  const submitBtn = document.querySelector('#form-task button[type="submit"]');
  const completedContainer = document.getElementById('form-task-completed').closest('.form-control');

  return (event) => {
    if (event.target.value) {
      submitBtn.classList.add('btn-warning');
      submitBtn.classList.remove('btn-success');
      completedContainer.classList.remove('hidden');
    } else {
      submitBtn.classList.add('btn-success');
      submitBtn.classList.remove('btn-warning');
      completedContainer.classList.add('hidden');
    }
  };
})();

const handleDeleteClick = (() => {
  function afterSuccess(id) {
    tasksList.deleteItem(id);
  }

  return (event) => {
    const btn = event.target;

    if (!btn.matches('#list-tasks .btn-delete')) return;

    event.stopPropagation();

    const listItem = btn.closest('.list-task');
    const id = Number(tasksList.extractItemId(listItem));

    Task.delete({
      key: id,
      successCallback() { afterSuccess(id) },
    });
  }
})();

const handleUpdateClick = (() => {
  function afterSuccess({ result }) {
    const idInput = document.getElementById('form-task-id');
    idInput.value = result.id;

    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
    });
    idInput.dispatchEvent(inputEvent);

    document.getElementById('form-task-title').value = result.title;
    document.getElementById('form-task-completed').checked = !!result.completed_at;
  }

  return (event) => {
    const btn = event.target;

    if (!btn.matches('#list-tasks .btn-edit')) return;

    event.stopPropagation();

    const listItem = btn.closest('.list-task');
    const id = Number(tasksList.extractItemId(listItem));

    Task.findByKey({
      key: id,
      successCallback({ result }) { afterSuccess({ result }) },
    });
  }
})();

window.addEventListener('load', () => {
  DB.startConnection();

  document.getElementById('form-task').addEventListener('reset', handleFormReset)
  document.getElementById('form-task').addEventListener('submit', handleTaskSubmit);
  document.getElementById('form-task-id').addEventListener('input', handleIdChange);
  document.addEventListener('click', handleDeleteClick);
  document.addEventListener('click', handleUpdateClick);
});
