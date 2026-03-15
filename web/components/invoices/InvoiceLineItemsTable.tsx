import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export interface InvoiceLineItemsTableProps {
  lineItems: any[];
  canEditLineItems: boolean;
  editingLineItemId: string | null;
  editLineItemValues: { description: string; qty: number; unitPrice: number };
  updatingLineItem: boolean;
  deletingLineItem: boolean;
  onEditStart: (item: any) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditChange: (values: { description: string; qty: number; unitPrice: number }) => void;
  onDelete: (itemId: string) => void;
  onAddClick: () => void;
  subtotal: number | null | undefined;
  taxRate: number | null | undefined;
  taxAmount: number | null | undefined;
  discountAmount: number | null | undefined;
  total: number | null | undefined;
  totalPaid: number;
  remainingBalance: number;
}

export function InvoiceLineItemsTable({
  lineItems,
  canEditLineItems,
  editingLineItemId,
  editLineItemValues,
  updatingLineItem,
  deletingLineItem,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditChange,
  onDelete,
  onAddClick,
  subtotal,
  taxRate,
  taxAmount,
  discountAmount,
  total,
  totalPaid,
  remainingBalance,
}: InvoiceLineItemsTableProps) {
  const editingTotal = editLineItemValues.qty * editLineItemValues.unitPrice;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Line Items</CardTitle>
        {canEditLineItems ? (
          <Button variant="outline" size="sm" onClick={onAddClick}>
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        ) : (
          <Lock className="h-4 w-4 text-muted-foreground" />
        )}
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Description</TableHead>
              <TableHead className="text-right w-16">Qty</TableHead>
              <TableHead className="text-right w-28">Unit Price</TableHead>
              <TableHead className="text-right pr-6 w-28">Total</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  No line items yet.
                </TableCell>
              </TableRow>
            ) : (
              lineItems.map((item) =>
                item.id === editingLineItemId ? (
                  <TableRow key={item.id}>
                    <TableCell className="pl-6">
                      <Input
                        className="h-8"
                        value={editLineItemValues.description}
                        onChange={(e) =>
                          onEditChange({
                            ...editLineItemValues,
                            description: e.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="h-8 w-16 text-right"
                        value={editLineItemValues.qty}
                        onChange={(e) =>
                          onEditChange({
                            ...editLineItemValues,
                            qty: Number(e.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-24 text-right"
                        value={editLineItemValues.unitPrice}
                        onChange={(e) =>
                          onEditChange({
                            ...editLineItemValues,
                            unitPrice: Number(e.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      {formatCurrency(editingTotal)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={onEditSave}
                          disabled={updatingLineItem}
                        >
                          {updatingLineItem ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={onEditCancel}
                          disabled={updatingLineItem}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={item.id}>
                    <TableCell className="pl-6">{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      {formatCurrency(item.total)}
                    </TableCell>
                    <TableCell>
                      {canEditLineItems && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onEditStart(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={deletingLineItem}
                            onClick={() => onDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              )
            )}
          </TableBody>
        </Table>
      </CardContent>

      <CardFooter className="flex justify-end pt-4 pb-4">
        <div className="w-full max-w-xs space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          {taxAmount != null && taxAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Tax ({taxRate != null ? taxRate : 0}%)
              </span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
          )}

          {discountAmount != null && discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-red-600">-{formatCurrency(discountAmount)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>

          {totalPaid > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-600">-{formatCurrency(totalPaid)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Balance Due</span>
                <span
                  className={
                    remainingBalance > 0 ? "text-red-600" : "text-green-600"
                  }
                >
                  {formatCurrency(remainingBalance)}
                </span>
              </div>
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}