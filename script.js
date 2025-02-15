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

const taskForm = (() => {
  const form = document.querySelector('#form-task');
  const idInput = form.querySelector('#form-task-id');
  const titleInput = form.querySelector('#form-task-title');
  const completedInput = form.querySelector('#form-task-completed');
  const completedContainer = completedInput.closest('.form-control');
  const submitBtn = form.querySelector('button[type="submit"]');

  function getId() {
    return Number(idInput.value);
  }

  function getTitle() {
    return titleInput.value.trim();
  }

  function toggleToCreate() {
    completedContainer.classList.add('hidden');
    submitBtn.classList.add('btn-success');
    submitBtn.classList.remove('btn-warning');
  }

  function toggleToEdit() {
    completedContainer.classList.remove('hidden');
    submitBtn.classList.add('btn-warning');
    submitBtn.classList.remove('btn-success');
  }

  return Object.freeze({
    toggleCreateOrEdit(id) {
      if (id === undefined) {
        id = getId();
      }

      if (id) {
        toggleToEdit();
      } else {
        toggleToCreate();
      }
    },

    extractData() {
      const id = getId();
      const title = getTitle();
      const completed = completedInput.checked;

      const object = { title };

      if (id) {
        object.id = id;
      }

      if (completed) {
        object.completed_at = new Date().toISOString();
      } else {
        object.completed_at = null;
      }

      return object;
    },

    fillData({ object }) {
      idInput.value = object.id;
      titleInput.value = object.title;
      completedInput.checked = !!object.completed_at;

      toggleToEdit();
    },

    reset() {
      form.reset();
    },
  });
})();

const tasksList = (() => {
  const LIST_ITEM_ID_PREFIX = 'list_task_';

  const uncompletedList = document.querySelector('#list-uncompleted-tasks');
  const completedList = document.querySelector('#list-completed-tasks');

  function buildItem({ object }) {
    const itemTemplate = document.querySelector('#list-task-item-template');
    const itemClone = itemTemplate.content.cloneNode(true);

    const newItem = itemClone.firstElementChild;
    newItem.id = newItem.id.replace('{{taskId}}', object.id);

    const checkbox = newItem.querySelector('.list-task-completed');
    checkbox.checked = !!object.completed_at;

    const titleElement = newItem.querySelector('.list-task-title');
    titleElement.textContent = titleElement.textContent
      .replace('{{taskId}}', object.id)
      .replace('{{taskTitle}}', object.title);
    titleElement.classList.toggle('line-through', !!object.completed_at);

    const createdAtElement = newItem.querySelector('.list-task-created-at');
    createdAtElement.textContent = createdAtElement.textContent
      .replace('{{taskCreatedAt}}', formatDate(object.created_at));

    const updatedAtElement = newItem.querySelector('.list-task-updated-at');

    if (object.updated_at) {
      updatedAtElement.textContent = updatedAtElement.textContent
        .replace('{{taskUpdatedAt}}', formatDate(object.updated_at));
    } else {
      updatedAtElement.remove();
    }

    const completedAtElement = newItem.querySelector('.list-task-completed-at');

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
      const newItem = buildItem({ object });
      const targetList = object.completed_at ? completedList : uncompletedList;

      targetList.appendChild(newItem);
    },

    updateItem(object) {
      const id = object.id;
      const item = document.querySelector(`#${LIST_ITEM_ID_PREFIX}${id}`);
      const newItem = buildItem({ object });

      item.remove();

      const targetList = object.completed_at ? completedList : uncompletedList;

      targetList.appendChild(newItem);
    },

    deleteItem(id) {
      const item = document.querySelector(`#${LIST_ITEM_ID_PREFIX}${id}`);
      item.remove();
    },

    extractItemId(item) {
      return item.id.replace(LIST_ITEM_ID_PREFIX, '');
    },
  });
})();

const handleFormReset = (event) => {
  taskForm.toggleCreateOrEdit(null);
};

const handleTaskSubmit = (() => {
  function afterSuccessCreate(object, { event }) {
    object.id = event.target.result;

    tasksList.createNewItem(object);
    taskForm.reset();
  }

  function afterSuccessUpdate(object, params) {
    tasksList.updateItem(object);
    taskForm.reset();
  }

  return (event) => {
    event.preventDefault();

    const object = taskForm.extractData();

    if (!object.title) {
      throw new Error('title is required');
    }

    const id = object.id;

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

const handleIdChange = (event) => {
  taskForm.toggleCreateOrEdit(event.target.value);
};

const handleDeleteClick = (() => {
  function afterSuccess(id) {
    tasksList.deleteItem(id);
  }

  return (event) => {
    const btn = event.target;

    if (!btn.matches('.list-tasks .btn-delete')) return;

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
    taskForm.fillData({ object: result });
  }

  return (event) => {
    const btn = event.target;

    if (!btn.matches('.list-tasks .btn-edit')) return;

    event.stopPropagation();

    const listItem = btn.closest('.list-task');
    const id = Number(tasksList.extractItemId(listItem));

    Task.findByKey({
      key: id,
      successCallback({ result }) { afterSuccess({ result }) },
    });
  }
})();

const handleCompleteClick = (() => {
  function afterSuccess({ result }) {
    tasksList.updateItem(result);
  }

  return (event) => {
    const checkbox = event.target;

    if (!checkbox.matches('.list-tasks .list-task-completed')) return;

    event.stopPropagation();

    const listItem = checkbox.closest('.list-task');
    const id = Number(tasksList.extractItemId(listItem));

    Task.update({
      key: id,
      object: {
        completed_at: checkbox.checked ? new Date().toISOString() : null,
      },
      successCallback() {
        Task.findByKey({
          key: id,
          successCallback({ result }) { afterSuccess({ result }) },
        });
      },
    });
  }
})();

window.addEventListener('load', () => {
  DB.startConnection();

  document.querySelector('#form-task').addEventListener('reset', handleFormReset)
  document.querySelector('#form-task').addEventListener('submit', handleTaskSubmit);
  document.querySelector('#form-task-id').addEventListener('input', handleIdChange);
  document.addEventListener('click', handleDeleteClick);
  document.addEventListener('click', handleUpdateClick);
  document.addEventListener('click', handleCompleteClick);
});
