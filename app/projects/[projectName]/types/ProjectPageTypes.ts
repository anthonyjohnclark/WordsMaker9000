import { NodeModel } from "@minoru/react-dnd-treeview";

export type NodeData = {
  fileType: "file" | "folder" | undefined;
  fileName: string;
  fileId: string;
  wordCount: number;
  lastModified: Date;
  createDate: Date;
};

export interface ExtendedNodeModel extends NodeModel<NodeData> {
  parent: number;
}
