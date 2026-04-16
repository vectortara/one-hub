import { useState, useEffect, useCallback } from 'react';
import { showError, showInfo, showSuccess } from 'utils/common';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableContainer from '@mui/material/TableContainer';
import PerfectScrollbar from 'react-perfect-scrollbar';
import TablePagination from '@mui/material/TablePagination';
import LinearProgress from '@mui/material/LinearProgress';
import ButtonGroup from '@mui/material/ButtonGroup';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import { Button, Card, Stack, Container, Typography, Box, Menu, MenuItem, Checkbox, ListItemText, Tabs, Tab } from '@mui/material';
import LogTableRow from './component/TableRow';
import KeywordTableHead from 'ui-component/TableHead';
import TableToolBar from './component/TableToolBar';
import { API } from 'utils/api';
import { useIsAdmin } from 'utils/common';
import { PAGE_SIZE_OPTIONS, getPageSize, savePageSize } from 'constants';
import { Icon } from '@iconify/react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useSelector } from 'react-redux';
import { useLogType } from './type/LogType';
import {
  DEFAULT_ERROR_LOG_COLUMN_VISIBILITY,
  DEFAULT_LOG_COLUMN_VISIBILITY,
  getColumnMenuItems,
  getHeadLabels,
  getVisibleColumns
} from './utils/columns';
import { appendCsvRows, buildCsvHeader, buildExportFilename, buildExportKeyword, downloadCsvBlob } from './utils/export';
import { buildLogRequest, EXPORT_PAGE_SIZE, normalizeSort } from './utils/request';

function createOriginalKeyword() {
  return {
    p: 0,
    username: '',
    token_name: '',
    model_name: '',
    start_timestamp: dayjs().startOf('day').unix(),
    end_timestamp: dayjs().unix() + 3600,
    log_type: '0',
    channel_id: '',
    source_ip: ''
  };
}

function getErrorMessage(error) {
  return error?.response?.data?.message || error?.message || 'unknown error';
}

export default function Log() {
  const { t } = useTranslation();
  const initialKeyword = createOriginalKeyword();

  const [page, setPage] = useState(0);
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('created_at');
  const [rowsPerPage, setRowsPerPage] = useState(() => getPageSize('log'));
  const [listCount, setListCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toolBarValue, setToolBarValue] = useState(() => ({ ...initialKeyword }));
  const [searchKeyword, setSearchKeyword] = useState(() => ({ ...initialKeyword }));
  const [refreshFlag, setRefreshFlag] = useState(false);
  const { userGroup } = useSelector((state) => state.account);
  const theme = useTheme();
  const matchUpMd = useMediaQuery(theme.breakpoints.up('sm'));

  const [logs, setLogs] = useState([]);
  const userIsAdmin = useIsAdmin();
  const LogType = useLogType(userIsAdmin);

  const isErrorLog = searchKeyword.log_type === '5';

  const [columnVisibility, setColumnVisibility] = useState(() => ({ ...DEFAULT_LOG_COLUMN_VISIBILITY }));
  const [errorLogColumnVisibility, setErrorLogColumnVisibility] = useState(() => ({ ...DEFAULT_ERROR_LOG_COLUMN_VISIBILITY }));
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);

  const activeColumnVisibility = isErrorLog ? errorLogColumnVisibility : columnVisibility;
  const activeSetColumnVisibility = isErrorLog ? setErrorLogColumnVisibility : setColumnVisibility;
  const columnMenuItems = getColumnMenuItems({ isErrorLog, userIsAdmin, t });
  const headLabels = getHeadLabels({ isErrorLog, userIsAdmin, columnVisibility: activeColumnVisibility, t });
  const selectableColumnIds = columnMenuItems.map((column) => column.id);
  const areAllColumnsVisible = selectableColumnIds.length > 0 && selectableColumnIds.every((columnId) => activeColumnVisibility[columnId]);
  const hasVisibleColumnsSelected = selectableColumnIds.some((columnId) => activeColumnVisibility[columnId]);
  const exportButtonText = exporting ? t('logPage.exportingButton') : t('logPage.exportButton');

  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };

  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };

  const handleColumnVisibilityChange = (columnId) => {
    activeSetColumnVisibility((currentVisibility) => ({
      ...currentVisibility,
      [columnId]: !currentVisibility[columnId]
    }));
  };

  const handleSelectAllColumns = () => {
    const nextVisible = !areAllColumnsVisible;

    activeSetColumnVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility };

      selectableColumnIds.forEach((columnId) => {
        nextVisibility[columnId] = nextVisible;
      });

      return nextVisibility;
    });
  };

  const handleSort = (event, id) => {
    const isAsc = orderBy === id && order === 'asc';
    if (id !== '') {
      setOrder(isAsc ? 'desc' : 'asc');
      setOrderBy(id);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setPage(0);
    setRowsPerPage(newRowsPerPage);
    savePageSize('log', newRowsPerPage);
  };

  const searchLogs = async () => {
    const normalizedSort = normalizeSort(toolBarValue.log_type === '5', order, orderBy);

    setPage(0);

    if (normalizedSort.orderBy !== orderBy || normalizedSort.order !== order) {
      setOrderBy(normalizedSort.orderBy);
      setOrder(normalizedSort.order);
    }

    setSearchKeyword({ ...toolBarValue });
    setRefreshFlag((flag) => !flag);
  };

  const handleToolBarValue = (event) => {
    setToolBarValue((currentValue) => ({
      ...currentValue,
      [event.target.name]: event.target.value
    }));
  };

  const handleTabsChange = async (event, newValue) => {
    const updatedToolBarValue = { ...toolBarValue, log_type: newValue };
    const normalizedSort = normalizeSort(newValue === '5', order, orderBy);

    setToolBarValue(updatedToolBarValue);
    setPage(0);

    if (normalizedSort.orderBy !== orderBy || normalizedSort.order !== order) {
      setOrderBy(normalizedSort.orderBy);
      setOrder(normalizedSort.order);
    }

    setSearchKeyword(updatedToolBarValue);
  };

  const fetchData = useCallback(
    async (nextPage, nextRowsPerPage, keyword, nextOrder, nextOrderBy) => {
      setSearching(true);

      try {
        const request = buildLogRequest({
          keyword,
          userIsAdmin,
          order: nextOrder,
          orderBy: nextOrderBy
        });
        const res = await API.get(request.url, {
          params: {
            page: nextPage + 1,
            size: nextRowsPerPage,
            ...request.params
          }
        });
        const { success, message, data } = res.data;

        if (success) {
          setListCount(data?.total_count || 0);
          setLogs(data?.data || []);
        } else {
          showError(message);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setSearching(false);
      }
    },
    [userIsAdmin]
  );

  const handleRefresh = async () => {
    const resetKeyword = createOriginalKeyword();

    setOrderBy('created_at');
    setOrder('desc');
    setPage(0);
    setToolBarValue(resetKeyword);
    setSearchKeyword(resetKeyword);
    setRefreshFlag((flag) => !flag);
  };

  const handleExportLogs = async () => {
    if (searching || exporting) {
      return;
    }

    setExporting(true);

    try {
      const exportStartedAt = dayjs().unix();
      const exportKeyword = buildExportKeyword(searchKeyword, exportStartedAt);
      const exportIsErrorLog = exportKeyword.log_type === '5';
      const exportColumnVisibility = exportIsErrorLog ? errorLogColumnVisibility : columnVisibility;
      const visibleColumns = getVisibleColumns({
        isErrorLog: exportIsErrorLog,
        userIsAdmin,
        columnVisibility: exportColumnVisibility,
        t
      });

      if (visibleColumns.length === 0) {
        showInfo(t('logPage.exportNoVisibleColumns'));
        return;
      }

      const request = buildLogRequest({
        keyword: exportKeyword,
        userIsAdmin,
        order,
        orderBy
      });
      const firstPage = await API.get(request.url, {
        params: {
          ...request.params,
          page: 1,
          size: EXPORT_PAGE_SIZE
        }
      });

      if (!firstPage.data.success) {
        throw new Error(firstPage.data.message || t('logPage.exportFailed'));
      }

      const firstResult = firstPage.data.data || {};
      const totalCount = firstResult.total_count || 0;
      if (totalCount === 0) {
        showInfo(t('logPage.exportNoData'));
        return;
      }

      const formatterContext = {
        logTypes: LogType,
        t,
        userGroup
      };
      const blobParts = ['\uFEFF', buildCsvHeader(visibleColumns), '\r\n'];

      appendCsvRows(blobParts, firstResult.data || [], visibleColumns, formatterContext);

      const totalPages = Math.ceil(totalCount / EXPORT_PAGE_SIZE);
      for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
        const res = await API.get(request.url, {
          params: {
            ...request.params,
            page: pageNo,
            size: EXPORT_PAGE_SIZE
          }
        });

        if (!res.data.success) {
          throw new Error(res.data.message || t('logPage.exportFailed'));
        }

        appendCsvRows(blobParts, res.data.data?.data || [], visibleColumns, formatterContext);
      }

      downloadCsvBlob(blobParts, buildExportFilename(exportKeyword.log_type, dayjs.unix(exportStartedAt)));
      showSuccess(t('logPage.exportSuccess'));
    } catch (error) {
      showError(`${t('logPage.exportFailed')}: ${getErrorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchData(page, rowsPerPage, searchKeyword, order, orderBy);
  }, [page, rowsPerPage, searchKeyword, order, orderBy, fetchData, refreshFlag]);

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={5}>
        <Stack direction="column" spacing={1}>
          <Typography variant="h2">{t('logPage.title')}</Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Log
          </Typography>
        </Stack>
      </Stack>
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={toolBarValue.log_type}
            onChange={handleTabsChange}
            aria-label="basic tabs example"
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              '& .MuiTabs-indicator': {
                display: 'none'
              }
            }}
          >
            {Object.values(LogType).map((option) => {
              return <Tab key={option.value} label={option.text} value={option.value} />;
            })}
          </Tabs>
        </Box>
        <Box component="form" noValidate>
          <TableToolBar filterName={toolBarValue} handleFilterName={handleToolBarValue} userIsAdmin={userIsAdmin} />
        </Box>
        <Toolbar
          sx={{
            textAlign: 'right',
            height: 50,
            display: 'flex',
            justifyContent: 'space-between',
            p: (theme) => theme.spacing(0, 1, 0, 3)
          }}
        >
          <Container maxWidth="xl">
            {matchUpMd ? (
              <ButtonGroup variant="outlined" aria-label="outlined small primary button group">
                <Button onClick={handleRefresh} size="small" startIcon={<Icon icon="solar:refresh-bold-duotone" width={18} />}>
                  {t('logPage.refreshButton')}
                </Button>

                <Button onClick={searchLogs} size="small" startIcon={<Icon icon="solar:minimalistic-magnifer-line-duotone" width={18} />}>
                  {t('logPage.searchButton')}
                </Button>

                <Button
                  onClick={handleExportLogs}
                  size="small"
                  disabled={searching || exporting}
                  startIcon={<Icon icon="solar:download-bold-duotone" width={18} />}
                >
                  {exportButtonText}
                </Button>

                <Button onClick={handleColumnMenuOpen} size="small" startIcon={<Icon icon="solar:settings-bold-duotone" width={18} />}>
                  {t('logPage.columnSettings')}
                </Button>
              </ButtonGroup>
            ) : (
              <Stack
                direction="row"
                spacing={1}
                divider={<Divider orientation="vertical" flexItem />}
                justifyContent="space-around"
                alignItems="center"
              >
                <IconButton onClick={handleRefresh} size="small" aria-label={t('logPage.refreshButton')}>
                  <Icon icon="solar:refresh-bold-duotone" width={18} />
                </IconButton>
                <IconButton onClick={searchLogs} size="small" aria-label={t('logPage.searchButton')}>
                  <Icon icon="solar:minimalistic-magnifer-line-duotone" width={18} />
                </IconButton>
                <IconButton onClick={handleExportLogs} size="small" disabled={searching || exporting} aria-label={exportButtonText}>
                  <Icon icon="solar:download-bold-duotone" width={18} />
                </IconButton>
                <IconButton onClick={handleColumnMenuOpen} size="small" aria-label={t('logPage.columnSettings')}>
                  <Icon icon="solar:settings-bold-duotone" width={18} />
                </IconButton>
              </Stack>
            )}

            <Menu
              anchorEl={columnMenuAnchor}
              open={Boolean(columnMenuAnchor)}
              onClose={handleColumnMenuClose}
              PaperProps={{
                style: {
                  maxHeight: 300,
                  width: 200
                }
              }}
            >
              <MenuItem disabled>
                <Typography variant="subtitle2">{t('logPage.selectColumns')}</Typography>
              </MenuItem>
              <MenuItem onClick={handleSelectAllColumns} dense>
                <Checkbox checked={areAllColumnsVisible} indeterminate={!areAllColumnsVisible && hasVisibleColumnsSelected} size="small" />
                <ListItemText primary={t('logPage.columnSelectAll')} />
              </MenuItem>
              {columnMenuItems.map((column) => (
                <MenuItem key={column.id} onClick={() => handleColumnVisibilityChange(column.id)} dense>
                  <Checkbox checked={activeColumnVisibility[column.id] || false} size="small" />
                  <ListItemText primary={column.label} />
                </MenuItem>
              ))}
            </Menu>
          </Container>
        </Toolbar>
        {(searching || exporting) && <LinearProgress />}
        <PerfectScrollbar component="div">
          <TableContainer sx={{ overflow: 'unset' }}>
            <Table sx={{ minWidth: 800 }}>
              <KeywordTableHead order={order} orderBy={orderBy} onRequestSort={handleSort} headLabel={headLabels} />
              <TableBody>
                {logs.map((row, index) => (
                  <LogTableRow
                    item={row}
                    key={`${row.id}_${index}`}
                    userIsAdmin={userIsAdmin}
                    userGroup={userGroup}
                    columnVisibility={activeColumnVisibility}
                    isErrorLog={isErrorLog}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </PerfectScrollbar>
        <TablePagination
          page={page}
          component="div"
          count={listCount}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          onRowsPerPageChange={handleChangeRowsPerPage}
          showFirstButton
          showLastButton
        />
      </Card>
    </>
  );
}
