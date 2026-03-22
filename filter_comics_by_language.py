#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
漫画语言筛选脚本：根据漫画语言筛选并删除非目标语言的漫画

保留规则：
- Chinese（中文）
- Japanese（日文）
- 无语言标记（空字符串）

删除规则：
- 其他所有语言（如 English, Korean 等）

用法：
    python filter_comics_by_language.py <漫画目录> --hitomi-data <元数据路径>
    python filter_comics_by_language.py J:\\hitomi_comics --dry-run  # 预览模式
    python filter_comics_by_language.py J:\\hitomi_comics --execute  # 实际删除
"""

import os
import sys
import re
import argparse
import shutil
from typing import Optional, Dict, List
from dataclasses import dataclass
from datetime import datetime

from rich.console import Console
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
    TimeElapsedColumn,
)
from rich.table import Table

console = Console()


@dataclass
class ComicMetadata:
    """漫画元数据"""
    id: str
    title: str
    language: str = ""


class HitomiDataLoader:
    """从 hitomi_data 加载完整元数据"""
    
    def __init__(self, hitomi_data_dir: str = None):
        self.hitomi_data_dir = hitomi_data_dir
        self._id_to_metadata: Dict[str, dict] = {}
        
    def load(self):
        """加载所有 hitomi_data 文件"""
        if not self.hitomi_data_dir or not os.path.exists(self.hitomi_data_dir):
            return
        
        import msgpack
        
        for filename in os.listdir(self.hitomi_data_dir):
            if not filename.endswith('_pack.json'):
                continue
            
            filepath = os.path.join(self.hitomi_data_dir, filename)
            try:
                with open(filepath, 'rb') as f:
                    data = msgpack.unpackb(f.read(), use_list=False, raw=False)
                
                for item in data:
                    comic_id = item.get('id')
                    if comic_id is None:
                        continue
                    
                    comic_id_str = str(comic_id)
                    
                    # 解析元数据（只需要 ID、标题、语言）
                    metadata = {
                        'id': comic_id_str,
                        'title': item.get('n', ''),
                        'language': item.get('l', ''),
                    }
                    
                    # 存储（同时存储字符串和原始类型）
                    self._id_to_metadata[comic_id_str] = metadata
                    self._id_to_metadata[comic_id] = metadata
                    
            except Exception:
                continue
    
    def get_metadata(self, comic_id: str) -> Optional[dict]:
        """获取漫画的完整元数据"""
        return self._id_to_metadata.get(comic_id)
    
    def get_language(self, comic_id: str) -> Optional[str]:
        """获取漫画语言"""
        metadata = self._id_to_metadata.get(comic_id)
        if metadata:
            return metadata.get('language', '')
        return None


def extract_id_from_folder(folder_name: str) -> Optional[str]:
    """
    从文件夹名提取 ID
    
    格式：[Artist] Title (123456)[Language]
    
    规则：提取最后一个 (数字) 作为 ID，但必须后面紧跟 [Language] 或结尾
    """
    # 匹配模式：(数字) 后面紧跟 [语言] 或结尾
    matches = re.findall(r'\((\d+)\)\s*(?:\[|$)', folder_name)
    if matches:
        return matches[-1]
    
    # 备用方案：如果上面没匹配到，尝试找最后一个 (数字)
    all_matches = re.findall(r'\((\d+)\)', folder_name)
    if all_matches:
        return all_matches[-1]
    
    return None


def extract_id_from_info_txt(folder_path: str) -> Optional[str]:
    """从 info.txt 中提取 ID（格式：图库 ID: 123456）"""
    info_path = os.path.join(folder_path, "info.txt")
    if not os.path.exists(info_path):
        return None
    
    try:
        with open(info_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 查找 "图库 ID: xxx" 或 "ID: xxx"
        id_match = re.search(r'(?:图库\s*)?ID:\s*(\d+)', content)
        if id_match:
            return id_match.group(1)
    except Exception:
        pass
    
    return None


def extract_id_from_cbz(cbz_path: str) -> Optional[str]:
    """从 CBZ 文件的 ComicInfo.xml 中提取 ID"""
    import zipfile
    
    try:
        with zipfile.ZipFile(cbz_path, 'r') as zf:
            if 'ComicInfo.xml' not in zf.namelist():
                return None
            
            with zf.open('ComicInfo.xml') as f:
                content = f.read().decode('utf-8')
            
            # 从 Notes 字段提取 ID: "Hitomi.la Gallery ID: 123456"
            id_match = re.search(r'Hitomi\.la Gallery ID:\s*(\d+)', content)
            if id_match:
                return id_match.group(1)
            
            # 备用：从 Web 字段提取
            web_match = re.search(r'hitomi\.la/galleries/(\d+)', content)
            if web_match:
                return web_match.group(1)
                
    except Exception:
        pass
    
    return None


def should_keep(language: Optional[str]) -> tuple[bool, str]:
    """
    判断是否应该保留该漫画
    
    Returns:
        (should_keep, reason): 是否保留及原因
    """
    # 无语言信息 -> 保留
    if language is None or language == '':
        return True, "无语言标记 -> 保留"
    
    lang_lower = language.lower()
    
    # 中文 -> 保留
    if lang_lower == 'chinese':
        return True, "Chinese -> 保留"
    
    # 日文 -> 保留
    if lang_lower == 'japanese':
        return True, "Japanese -> 保留"
    
    # 其他语言 -> 删除
    return False, f"{language} -> 删除"


def delete_folder(folder_path: str) -> tuple[bool, str]:
    """彻底删除文件夹"""
    try:
        shutil.rmtree(folder_path)
        if not os.path.exists(folder_path):
            return True, "删除成功"
        else:
            return False, "文件夹仍存在"
    except Exception as e:
        return False, str(e)


def filter_comics(
    source_dir: str,
    hitomi_data_dir: str,
    dry_run: bool = True,
):
    """筛选漫画"""
    
    # 加载 hitomi_data
    with console.status("[bold green]正在加载 hitomi_data 元数据...[/bold green]"):
        loader = HitomiDataLoader(hitomi_data_dir)
        loader.load()
    
    total_records = len(loader._id_to_metadata) // 2
    console.print(f"[green]✓[/green] 从 hitomi_data 加载了 {total_records} 条元数据")
    
    # 扫描目录
    console.print(f"[bold]扫描目录:[/bold] {source_dir}")
    items = []
    
    try:
        with os.scandir(source_dir) as entries:
            for entry in entries:
                try:
                    if entry.is_dir() or entry.name.lower().endswith('.cbz'):
                        items.append((entry.name, entry.path, 'dir' if entry.is_dir() else 'cbz'))
                except OSError:
                    pass
    except OSError as e:
        console.print(f"[red]错误: 无法读取源目录: {e}[/red]")
        return
    
    total = len(items)
    console.print(f"[green]✓[/green] 找到 {total} 个漫画项目\n")
    
    if total == 0:
        console.print("[yellow]没有找到漫画[/yellow]")
        return
    
    # 统计
    stats = {
        'kept': 0,
        'deleted': 0,
        'delete_failed': 0,
        'no_metadata': 0,
        'kept_detail': {'chinese': 0, 'japanese': 0, 'no_language': 0},
        'deleted_detail': {},
    }
    
    to_delete: List[Dict] = []
    no_metadata_items: List[Dict] = []
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        
        task = progress.add_task("[cyan]分析漫画语言...[/cyan]", total=total)
        
        for item_name, item_path, item_type in items:
            display_name = item_name[:50] + "..." if len(item_name) > 50 else item_name
            progress.update(task, description=f"[cyan]检查: {display_name}[/cyan]")
            
            # 提取 ID
            comic_id = None
            language = None
            
            if item_type == 'dir':
                # 文件夹：先从文件夹名提取，再从 info.txt
                comic_id = extract_id_from_folder(item_name)
                if comic_id:
                    language = loader.get_language(comic_id)
                if language is None:
                    comic_id = extract_id_from_info_txt(item_path)
                    if comic_id:
                        language = loader.get_language(comic_id)
            else:
                # CBZ 文件：从 ComicInfo.xml 提取
                comic_id = extract_id_from_cbz(item_path)
                if comic_id:
                    language = loader.get_language(comic_id)
            
            # 无法获取元数据
            if comic_id is None or language is None:
                no_metadata_items.append({
                    'path': item_path,
                    'name': item_name,
                    'comic_id': comic_id,
                })
                stats['no_metadata'] += 1
                progress.advance(task)
                continue
            
            # 判断是否保留
            keep, reason = should_keep(language)
            
            if keep:
                stats['kept'] += 1
                lang_lower = language.lower() if language else ''
                if lang_lower == 'chinese':
                    stats['kept_detail']['chinese'] += 1
                elif lang_lower == 'japanese':
                    stats['kept_detail']['japanese'] += 1
                else:
                    stats['kept_detail']['no_language'] += 1
            else:
                to_delete.append({
                    'path': item_path,
                    'name': item_name,
                    'comic_id': comic_id,
                    'language': language,
                    'reason': reason,
                })
            
            progress.advance(task)
    
    # 显示待删除列表
    if to_delete:
        console.print(f"\n[bold red]待删除的漫画 ({len(to_delete)} 个):[/bold red]")
        
        del_table = Table(show_header=True, header_style="bold magenta")
        del_table.add_column("语言", style="cyan", width=12)
        del_table.add_column("ID", style="dim", width=12)
        del_table.add_column("名称", style="white")
        
        for item in to_delete[:20]:  # 只显示前20个
            del_table.add_row(
                item['language'],
                item['comic_id'],
                item['name'][:60] + "..." if len(item['name']) > 60 else item['name']
            )
        
        if len(to_delete) > 20:
            del_table.add_row("...", f"...", f"还有 {len(to_delete) - 20} 个...")
        
        console.print(del_table)
        
        # 统计各语言删除数量
        lang_counts: Dict[str, int] = {}
        for item in to_delete:
            lang = item['language']
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
        stats['deleted_detail'] = lang_counts
    
    # 执行删除
    if to_delete and not dry_run:
        console.print(f"\n[bold yellow]正在删除 {len(to_delete)} 个漫画...[/bold yellow]")
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            
            task = progress.add_task("[red]删除漫画...[/red]", total=len(to_delete))
            
            for item in to_delete:
                display_name = item['name'][:40] + "..." if len(item['name']) > 40 else item['name']
                progress.update(task, description=f"[red]删除: {display_name}[/red]")
                
                success, msg = delete_folder(item['path'])
                if success:
                    stats['deleted'] += 1
                else:
                    stats['delete_failed'] += 1
                    console.print(f"[yellow]⚠ 删除失败: {item['name']} - {msg}[/yellow]")
                
                progress.advance(task)
    
    # 写入日志
    log_file = os.path.join(os.getcwd(), f"language_filter_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
    with open(log_file, 'w', encoding='utf-8') as f:
        f.write(f"# 漫画语言筛选日志\n")
        f.write(f"# 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"# 源目录: {source_dir}\n")
        f.write(f"# 模式: {'预览' if dry_run else '执行删除'}\n\n")
        
        f.write(f"== 统计 ==\n")
        f.write(f"保留: {stats['kept']}\n")
        f.write(f"  - Chinese: {stats['kept_detail']['chinese']}\n")
        f.write(f"  - Japanese: {stats['kept_detail']['japanese']}\n")
        f.write(f"  - 无语言: {stats['kept_detail']['no_language']}\n")
        f.write(f"删除: {len(to_delete)}\n")
        for lang, count in stats['deleted_detail'].items():
            f.write(f"  - {lang}: {count}\n")
        f.write(f"无元数据: {stats['no_metadata']}\n\n")
        
        if to_delete:
            f.write(f"== 待删除列表 ==\n")
            for item in to_delete:
                f.write(f"ID: {item['comic_id']}\n")
                f.write(f"语言: {item['language']}\n")
                f.write(f"路径: {item['path']}\n")
                f.write("-" * 80 + "\n")
        
        if no_metadata_items:
            f.write(f"\n== 无元数据列表 ==\n")
            for item in no_metadata_items:
                f.write(f"ID: {item['comic_id']}\n")
                f.write(f"路径: {item['path']}\n")
                f.write("-" * 80 + "\n")
    
    console.print(f"\n[dim]日志已保存到: {log_file}[/dim]")
    
    # 打印统计
    table = Table(title="\n筛选统计")
    table.add_column("状态", style="cyan")
    table.add_column("数量", justify="right", style="green")
    
    table.add_row("保留", str(stats['kept_detail']['chinese']))
    table.add_row("保留", str(stats['kept_detail']['japanese']))
    table.add_row("保留 (无语言)", str(stats['kept_detail']['no_language']))
    table.add_row("[bold]保留总计[/bold]", f"[bold]{stats['kept']}[/bold]")
    table.add_row("删除", str(len(to_delete)))
    table.add_row("无元数据", str(stats['no_metadata']))
    table.add_row("[bold]总计[/bold]", f"[bold]{total}[/bold]")
    
    console.print(table)
    
    if dry_run and to_delete:
        console.print(f"\n[yellow][预览模式] 使用 --execute 参数实际执行删除[/yellow]")


def main():
    parser = argparse.ArgumentParser(
        description="根据漫画语言筛选并删除非目标语言的漫画",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
保留规则：
  - Chinese（中文）
  - Japanese（日文）
  - 无语言标记

示例：
  python filter_comics_by_language.py J:\\hitomi_comics --dry-run  # 预览
  python filter_comics_by_language.py J:\\hitomi_comics --execute  # 执行删除
        """
    )
    
    parser.add_argument("source_dir", help="漫画目录")
    parser.add_argument("--hitomi-data", 
                        default="D:/soft/to_run/Technical Preview Hitomi-Downloader/core/hitomi_data",
                        help="hitomi_data 目录路径")
    parser.add_argument("--dry-run", action="store_true", default=True,
                        help="预览模式，不实际删除（默认）")
    parser.add_argument("--execute", action="store_true",
                        help="实际执行删除")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.source_dir):
        console.print(f"[red]错误: 源目录不存在: {args.source_dir}[/red]")
        sys.exit(1)
    
    if not os.path.exists(args.hitomi_data):
        console.print(f"[red]错误: hitomi_data 目录不存在: {args.hitomi_data}[/red]")
        sys.exit(1)
    
    # 如果指定 --execute，则关闭 dry_run
    dry_run = not args.execute
    
    filter_comics(
        source_dir=args.source_dir,
        hitomi_data_dir=args.hitomi_data,
        dry_run=dry_run,
    )


if __name__ == "__main__":
    main()
